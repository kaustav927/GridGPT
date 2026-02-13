import Anthropic from '@anthropic-ai/sdk';
import { query, execute } from '@/lib/clickhouse';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { validateSQL } from '@/lib/chat/sql-safety';
import type { ChatMessage } from '@/lib/chat/types';

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

const MAX_TOOL_ITERATIONS = 3;
const MAX_RESULT_ROWS = 100;
const RATE_LIMIT_PER_DAY = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COOKIE_NAME = 'gridgpt-uid';
const COOKIE_MAX_AGE = 31536000; // 1 year

function makeCookie(uid: string): string {
  return `${COOKIE_NAME}=${uid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

export async function POST(request: Request) {
  // Parse body first — errors here return 500 JSON (pre-stream)
  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages: ChatMessage[] = body.messages ?? [];

  // --- Rate limiting (cookie-based, fail-open) ---
  const cookieHeader = request.headers.get('cookie') || '';
  const existingUid = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1];

  const uid = existingUid && UUID_RE.test(existingUid) ? existingUid : crypto.randomUUID();
  let remaining = -1; // -1 = unknown (rate limit check failed)

  if (process.env.NODE_ENV === 'production') {
    try {
      const rows = await query<{ cnt: number }>(
        `SELECT count() AS cnt FROM ieso.chat_rate_limits WHERE user_id = '${uid}' AND requested_at >= now() - INTERVAL 1 DAY`
      );
      const count = rows[0]?.cnt ?? 0;

      if (count >= RATE_LIMIT_PER_DAY) {
        return new Response(
          JSON.stringify({
            error: 'rate_limit',
            message: `You've reached the limit of ${RATE_LIMIT_PER_DAY} questions per day. Come back tomorrow!`,
            remaining: 0,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': makeCookie(uid),
            },
          }
        );
      }

      await execute(`INSERT INTO ieso.chat_rate_limits (user_id) VALUES ('${uid}')`);
      remaining = RATE_LIMIT_PER_DAY - count - 1;
    } catch (err) {
      // Fail-open: if rate limit check fails, proceed anyway
      console.error('Rate limit check failed (proceeding):', err instanceof Error ? err.message : err);
    }
  }

  // --- Progressive SSE streaming ---
  const recentMessages = messages.slice(-10);
  const anthropicMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const systemPrompt = buildSystemPrompt();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Emit quota as the first event so frontend can display counter
        if (remaining >= 0) {
          send({ type: 'quota', remaining });
        }

        let currentMessages = [...anthropicMessages];
        let iterations = 0;

        while (iterations < MAX_TOOL_ITERATIONS) {
          const apiStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: currentMessages,
            tools: [TOOL_DEFINITION],
          });

          // Stream text tokens to user in real-time as Claude generates them
          apiStream.on('text', (text) => {
            send({ type: 'text_delta', content: text });
          });

          const response = await apiStream.finalMessage();

          if (response.stop_reason === 'tool_use') {
            const assistantContent = response.content;
            const toolUseBlock = assistantContent.find(
              (block): block is Anthropic.ContentBlockParam & { type: 'tool_use'; id: string; name: string; input: Record<string, string> } =>
                block.type === 'tool_use'
            );

            if (!toolUseBlock) break;

            const sql = toolUseBlock.input.sql;
            const strategy = toolUseBlock.input.strategy || '';

            // Emit tool_use immediately — user sees strategy + spinner
            send({ type: 'tool_use', name: 'query_clickhouse', sql, strategy });

            const startTime = Date.now();
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

            // Emit tool_result immediately — user sees row count + duration
            send({ type: 'tool_result', rowCount, durationMs });

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
            // Text already streamed via event handler
            break;
          }
        }

        // Fallback: if max iterations hit with no text streamed
        if (iterations >= MAX_TOOL_ITERATIONS) {
          const fallbackStream = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
              ...currentMessages,
              { role: 'user' as const, content: 'Please summarize your findings based on the data collected so far.' },
            ],
          });
          fallbackStream.on('text', (text) => {
            send({ type: 'text_delta', content: text });
          });
          await fallbackStream.finalMessage();
        }

        send({ type: 'done' });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Chat stream error:', message);
        send({ type: 'text_delta', content: `Error: ${message}` });
        send({ type: 'done' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Set-Cookie': makeCookie(uid),
    },
  });
}

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const existingUid = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1];

  const uid = existingUid && UUID_RE.test(existingUid) ? existingUid : crypto.randomUUID();

  try {
    const rows = await query<{ cnt: number }>(
      `SELECT count() AS cnt FROM ieso.chat_rate_limits WHERE user_id = '${uid}' AND requested_at >= now() - INTERVAL 1 DAY`
    );
    const count = rows[0]?.cnt ?? 0;
    const remaining = RATE_LIMIT_PER_DAY - count;

    return new Response(JSON.stringify({ remaining }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': makeCookie(uid),
      },
    });
  } catch {
    // Fail-open: return unknown
    return new Response(JSON.stringify({ remaining: -1 }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': makeCookie(uid),
      },
    });
  }
}
