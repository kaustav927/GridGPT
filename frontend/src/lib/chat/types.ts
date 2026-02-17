export interface SourceCitation {
  name: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallMeta[];
  sources?: SourceCitation[];
}

export interface ToolCallMeta {
  sql: string;
  strategy: string;
  rowCount: number;
  durationMs: number;
}

export type SSEEvent =
  | { type: 'tool_use'; name: string; sql: string; strategy: string }
  | { type: 'tool_result'; rowCount: number; durationMs: number }
  | { type: 'text_delta'; content: string }
  | { type: 'sources_loading' }
  | { type: 'sources'; sources: SourceCitation[] }
  | { type: 'quota'; remaining: number }
  | { type: 'done' };

export interface PendingToolCall {
  sql: string;
  strategy: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}
