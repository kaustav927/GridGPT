'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { ChatMessage, ToolCallMeta, SSEEvent, PendingToolCall } from '@/lib/chat/types';
import { getSuggestedQuestions, getRandomSuggestedQuestions } from '@/lib/chat/suggested-questions';
import styles from './GridChat.module.css';

const STORAGE_KEY = 'ogc-chat-history';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(text: string): string {
  // Split on triple-backtick code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).replace(/^\w*\n/, '');
        return `<pre>${escapeHtml(code)}</pre>`;
      }
      // Process non-code blocks line by line for headings & lists
      const lines = part.split('\n');
      let html = '';
      let inUl = false;
      let inOl = false;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Close open lists if this line isn't a list item
        const isUnordered = /^[\-\*] /.test(line);
        const isOrdered = /^\d+\. /.test(line);

        if (!isUnordered && inUl) {
          html += '</ul>';
          inUl = false;
        }
        if (!isOrdered && inOl) {
          html += '</ol>';
          inOl = false;
        }

        // Headings
        if (line.startsWith('### ')) {
          html += `<h4 class="${styles.mdH3}">${applyInline(line.slice(4))}</h4>`;
          continue;
        }
        if (line.startsWith('## ')) {
          html += `<h3 class="${styles.mdH2}">${applyInline(line.slice(3))}</h3>`;
          continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
          html += '<hr />';
          continue;
        }

        // Unordered list
        if (isUnordered) {
          if (!inUl) {
            html += '<ul>';
            inUl = true;
          }
          html += `<li>${applyInline(line.replace(/^[\-\*] /, ''))}</li>`;
          continue;
        }

        // Ordered list
        if (isOrdered) {
          if (!inOl) {
            html += '<ol>';
            inOl = true;
          }
          html += `<li>${applyInline(line.replace(/^\d+\. /, ''))}</li>`;
          continue;
        }

        // Links: [text](url)
        line = applyInline(line);

        // Regular line
        if (line.trim() === '') {
          html += '<br />';
        } else {
          html += line + '<br />';
        }
      }

      // Close any open lists
      if (inUl) html += '</ul>';
      if (inOl) html += '</ol>';

      return html;
    })
    .join('');
}

function applyInline(text: string): string {
  // Links: [text](url)
  let html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return html;
}

interface ToolBadgeProps {
  meta: ToolCallMeta;
}

function ToolBadge({ meta }: ToolBadgeProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {meta.strategy && (
        <div className={styles.strategyText}>{meta.strategy}</div>
      )}
      <div className={styles.toolBadge} onClick={() => setOpen(!open)}>
        <span className={open ? styles.toolBadgeIconOpen : styles.toolBadgeIcon}>&#9654;</span>
        Queried {meta.rowCount} rows in {meta.durationMs}ms
      </div>
      {open && <div className={styles.toolSql}>{meta.sql}</div>}
    </div>
  );
}

function PendingToolBadge({ pending }: { pending: PendingToolCall }) {
  return (
    <div>
      {pending.strategy && (
        <div className={styles.strategyText}>{pending.strategy}</div>
      )}
      <div className={styles.toolBadgePending}>
        <span className={styles.toolSpinner} />
        Querying...
      </div>
    </div>
  );
}

// Memoized message bubble — prevents DOM replacement during streaming,
// which preserves text selection for copy/paste
const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={msg.role === 'user' ? styles.userMessage : styles.assistantMessage}>
      {msg.role === 'assistant' && msg.toolCalls && (
        <>
          {msg.toolCalls.map((tc, i) => (
            <ToolBadge key={i} meta={tc} />
          ))}
        </>
      )}
      <div
        className={styles.messageContent}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
      />
    </div>
  );
});

export default function GridChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingTools, setStreamingTools] = useState<ToolCallMeta[]>([]);
  const [pendingTool, setPendingTool] = useState<PendingToolCall | null>(null);
  const [suggestions, setSuggestions] = useState(() => getSuggestedQuestions());
  const messageListRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Client-side randomization of suggestions (fixes hydration mismatch)
  useEffect(() => {
    setSuggestions(getRandomSuggestedQuestions());
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setMessages(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // Smart auto-scroll: skip if user has text selected (preserves copy/paste)
  // or if user has scrolled up to read earlier messages
  useEffect(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    const el = messageListRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }, []);

  const sendMessageWithToolTracking = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput('');
      setLoading(true);
      setStreamingContent('');
      setStreamingTools([]);
      setPendingTool(null);

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        if (response.status === 429) {
          const data = await response.json();
          const rateLimitMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: data.message || 'Rate limit reached. Please try again later.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, rateLimitMsg]);
          return;
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        const tools: ToolCallMeta[] = [];
        let pendingSql = '';
        let pendingStrategy = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event: SSEEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'tool_use':
                  pendingSql = event.sql;
                  pendingStrategy = event.strategy || '';
                  setPendingTool({ sql: pendingSql, strategy: pendingStrategy });
                  break;
                case 'tool_result':
                  tools.push({
                    sql: pendingSql,
                    strategy: pendingStrategy,
                    rowCount: event.rowCount,
                    durationMs: event.durationMs,
                  });
                  pendingSql = '';
                  pendingStrategy = '';
                  setPendingTool(null);
                  setStreamingTools([...tools]);
                  break;
                case 'text_delta':
                  fullContent += event.content;
                  setStreamingContent(fullContent);
                  break;
                case 'done':
                  break;
              }
            } catch {
              // skip
            }
          }
        }

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now(),
          toolCalls: tools.length > 0 ? tools : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Something went wrong';
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${errMsg}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
        setStreamingContent('');
        setStreamingTools([]);
        setPendingTool(null);
      }
    },
    [messages, loading]
  );

  const handleSend = useCallback(() => {
    sendMessageWithToolTracking(input);
  }, [input, sendMessageWithToolTracking]);

  const handleSuggestionClick = useCallback(
    (question: string) => {
      sendMessageWithToolTracking(question);
    },
    [sendMessageWithToolTracking]
  );

  const handleSuggestionEdit = useCallback((question: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInput(question);
    textareaRef.current?.focus();
  }, []);

  const handleClear = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const showSuggestions = messages.length === 0 || (!loading && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant');

  const renderMessages = () => (
    <div className={styles.messageList} ref={messageListRef}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}

      {/* Streaming state */}
      {loading && (streamingContent || streamingTools.length > 0 || pendingTool) && (
        <div className={styles.assistantMessage}>
          {streamingTools.map((tc, i) => (
            <ToolBadge key={i} meta={tc} />
          ))}
          {pendingTool && <PendingToolBadge pending={pendingTool} />}
          {streamingContent && (
            <div
              className={styles.messageContent}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
            />
          )}
        </div>
      )}

      {/* Typing indicator */}
      {loading && !streamingContent && streamingTools.length === 0 && !pendingTool && (
        <div className={styles.typing}>
          <div className={styles.typingDot} />
          <div className={styles.typingDot} />
          <div className={styles.typingDot} />
        </div>
      )}
    </div>
  );

  const renderSuggestions = () =>
    showSuggestions ? (
      <div className={styles.suggestions}>
        <div className={styles.suggestionsLabel}>SUGGESTED</div>
        {suggestions.map((q, i) => (
          <div key={i} className={styles.questionChip} onClick={() => handleSuggestionClick(q)}>
            <span className={styles.chipText}>{q}</span>
            <span
              className={styles.chipEdit}
              onClick={(e) => handleSuggestionEdit(q, e)}
              title="Edit in input"
            >
              &#9998;
            </span>
          </div>
        ))}
      </div>
    ) : null;

  const renderInputArea = () => (
    <div className={styles.inputArea}>
      {messages.length > 0 && (
        <button className={styles.clearBtn} onClick={handleClear}>
          CLEAR
        </button>
      )}
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={input}
        onChange={handleTextareaChange}
        placeholder="Ask about the grid..."
        rows={1}
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <button className={styles.sendBtn} onClick={handleSend} disabled={loading || !input.trim()}>
        &#9654;
      </button>
    </div>
  );

  return (
    <>
      {renderMessages()}
      {renderSuggestions()}
      {renderInputArea()}
    </>
  );
}
