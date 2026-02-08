import Anthropic from '@anthropic-ai/sdk';
import { query } from '@/lib/clickhouse';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { validateSQL } from '@/lib/chat/sql-safety';
import type { ChatMessage, ToolCallMeta } from '@/lib/chat/types';

const anthropic = new Anthropic();

const TOOL_DEFINITION: Anthropic.Tool = {
  name: 'query_clickhouse',
  description: 'Execute a read-only SQL query against the IESO ClickHouse database. Always include a LIMIT clause (max 500). Provide a strategy explaining your query approach.',
  input_schema: {
    type: 'object' as const,
    properties: {
      strategy: {
        type: 'string',
        description: 'Brief plain-English explanation of what this query does and why (1-2 sentences). Shown to the user as "thinking" context.',
      },
      sql: {
        type: 'string',
        description: 'A SELECT query with a LIMIT clause (max 500 rows)',
      },
    },
    required: ['strategy', 'sql'],
  },
};

const MAX_TOOL_ITERATIONS = 5;
const MAX_RESULT_ROWS = 100;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages: ChatMessage[] = body.messages ?? [];

    // Convert chat messages to Anthropic format (last 20)
    const recentMessages = messages.slice(-20);
    const anthropicMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const systemPrompt = buildSystemPrompt();
    const toolCallsMeta: ToolCallMeta[] = [];

    // Phase A: Tool loop (non-streaming)
    let currentMessages = [...anthropicMessages];
    let finalText = '';
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: currentMessages,
        tools: [TOOL_DEFINITION],
      });

      if (response.stop_reason === 'tool_use') {
        // Find tool use blocks
        const assistantContent = response.content;
        const toolUseBlock = assistantContent.find(
          (block): block is Anthropic.ContentBlockParam & { type: 'tool_use'; id: string; name: string; input: Record<string, string> } =>
            block.type === 'tool_use'
        );

        if (!toolUseBlock) break;

        const sql = toolUseBlock.input.sql;
        const strategy = toolUseBlock.input.strategy || '';
        const startTime = Date.now();

        // Validate SQL
        const validation = validateSQL(sql);
        let toolResult: string;
        let rowCount = 0;

        if (!validation.valid) {
          toolResult = JSON.stringify({ error: validation.error });
        } else {
          try {
            const rows = await query<Record<string, unknown>>(sql);
            rowCount = rows.length;
            const truncated = rows.slice(0, MAX_RESULT_ROWS);
            toolResult = JSON.stringify({
              data: truncated,
              rowCount: rows.length,
              truncated: rows.length > MAX_RESULT_ROWS,
            });
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toolResult = JSON.stringify({ error: message });
          }
        }

        const durationMs = Date.now() - startTime;
        toolCallsMeta.push({ sql, strategy, rowCount, durationMs });

        // Add assistant response and tool result to conversation
        currentMessages = [
          ...currentMessages,
          { role: 'assistant' as const, content: assistantContent },
          {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: toolUseBlock.id,
                content: toolResult,
              },
            ],
          },
        ];

        iterations++;
      } else {
        // Extract final text
        for (const block of response.content) {
          if (block.type === 'text') {
            finalText += block.text;
          }
        }
        break;
      }
    }

    // If we hit max iterations, do one final call without tools
    if (iterations >= MAX_TOOL_ITERATIONS && !finalText) {
      const finalResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...currentMessages,
          { role: 'user' as const, content: 'Please summarize your findings based on the data collected so far.' },
        ],
      });
      for (const block of finalResponse.content) {
        if (block.type === 'text') {
          finalText += block.text;
        }
      }
    }

    // Phase B: Stream response as SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        // Emit tool call events
        for (const meta of toolCallsMeta) {
          send({ type: 'tool_use', name: 'query_clickhouse', sql: meta.sql, strategy: meta.strategy });
          send({ type: 'tool_result', rowCount: meta.rowCount, durationMs: meta.durationMs });
        }

        // Emit text in chunks with simulated streaming
        const chunkSize = 20;
        let offset = 0;

        const emitChunks = () => {
          const batchEnd = Math.min(offset + chunkSize * 5, finalText.length);

          while (offset < batchEnd) {
            const end = Math.min(offset + chunkSize, finalText.length);
            const chunk = finalText.slice(offset, end);
            send({ type: 'text_delta', content: chunk });
            offset = end;
          }

          if (offset < finalText.length) {
            setTimeout(emitChunks, 15);
          } else {
            send({ type: 'done' });
            controller.close();
          }
        };

        emitChunks();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Chat API error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
