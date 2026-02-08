export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallMeta[];
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
  | { type: 'done' };

export interface ChatRequest {
  messages: ChatMessage[];
}
