import { SUCCESS_CODE } from '../api/protocol';
/** The gateway can return Dify events, OpenAI deltas, or a JSON result. */
export interface LlmProgress {
  text: string;
  conversationId: string;
  messageId: string;
  payload?: Record<string, unknown>;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const textOf = (...values: unknown[]) =>
  values.find((v): v is string => typeof v === 'string' && v !== '') ?? '';


const structuredKeys = [
  'summary',
  'overview',
  'analysisSummary',
  'workflowSummary',
  'recommendedPackageType',
  'packageType',
  'targetType',
  'modules',
  'moduleList',
  'entities',
  'items',
  'clientPages',
  'client_pages',
  'pages',
  'missingInfo',
  'missing_info',
  'questions',
  'clarifyQuestions',
  'suggestions',
  'recommendations',
  'advice',
  'tips',
  'steps',
  'workflow',
  'prompts',
  'promptFlow',
  'promptList',
];

/** Bounded JSON parsing only; model text is never executed. */
export function structuredLlmResult(
  value: unknown,
  depth = 0,
): Record<string, unknown> | undefined {
  if (depth > 4 || value == null) return undefined;
  if (typeof value === 'string') {
    const candidates = [
      value,
      ...Array.from(value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1]),
    ];
    const start = value.indexOf('{'),
      end = value.lastIndexOf('}');
    if (start >= 0 && end > start) candidates.push(value.slice(start, end + 1));
    for (const candidate of candidates) {
      try {
        const found = structuredLlmResult(JSON.parse(candidate), depth + 1);
        if (found) return found;
      } catch {
        /* Try the next JSON candidate. */
      }
    }
    return undefined;
  }
  const raw = record(value);
  if (structuredKeys.some((key) => key in raw)) return raw;
  for (const key of [
    'structured',
    'payload',
    'outputs',
    'output',
    'result',
    'results',
    'data',
    'answer',
    'text',
    'content',
  ]) {
    const found = structuredLlmResult(raw[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function applyLlmEvent(state: LlmProgress, value: unknown, eventName = ''): LlmProgress {
  let raw = record(value);
  if (typeof raw.code === 'number' && raw.code !== SUCCESS_CODE) {
    throw new Error(textOf(raw.msg, raw.message) || 'AI service returned an error');
  }
  if (raw.code === SUCCESS_CODE && raw.data !== undefined) {
    value = raw.data;
    raw = record(value);
  }
  const event = textOf(raw.event, raw.type, eventName);
  if (event === 'error' || raw.error || raw.status === 'error' || raw.status === 'failed') {
    throw new Error(textOf(raw.message, raw.msg, raw.error, record(raw.error).message) || 'AI request failed');
  }
  const data = record(raw.data);
  if (data.status === 'failed')
    throw new Error(textOf(data.error, data.message) || 'AI request failed');
  const choices = Array.isArray(raw.choices) ? record(raw.choices[0]) : {};
  const delta = record(choices.delta ?? raw.delta);
  const incoming =
    typeof value === 'string'
      ? value
      : textOf(
          raw.answer,
          raw.text,
          raw.content,
          raw.output,
          raw.output_text,
          raw.chunk,
          delta.content,
          delta.text,
          raw.delta,
        );
  const terminal = ['message_end', 'workflow_finished', 'done'].includes(event);
  const explicitlyDelta =
    ['message', 'agent_message', 'text_chunk', 'text_delta', 'response.output_text.delta'].includes(
      event,
    ) ||
    choices.delta !== undefined ||
    raw.delta !== undefined;
  let text = state.text;
  if (incoming && (!terminal || !text)) {
    // Dify/OpenAI are deltas. Some compatible gateways send a cumulative answer without
    // an event type; only that shape uses prefix replacement.
    text = !explicitlyDelta && incoming.startsWith(text) ? incoming : text + incoming;
  }
  if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024)
    throw new Error('Response exceeds 2 MB, please try again');
  return {
    text,
    conversationId:
      textOf(raw.conversation_id, raw.conversationId, data.conversation_id) || state.conversationId,
    messageId: textOf(raw.message_id, raw.messageId, data.message_id) || state.messageId,
    payload: structuredLlmResult(raw) ?? state.payload,
  };
}

export async function readLlmResponse(
  response: Response,
  onProgress: (value: LlmProgress) => void,
  signal?: AbortSignal,
): Promise<LlmProgress> {
  let state: LlmProgress = { text: '', conversationId: '', messageId: '' };
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!response.ok || !type.includes('text/event-stream')) {
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    if (!response.ok)
      throw new Error(
        textOf(record(parsed).msg, record(parsed).message) || `AI request failed (${response.status})`,
      );
    if (parsed === null) throw new Error('AI service returned an invalid response; check the service configuration');
    state = applyLlmEvent(state, parsed);
    onProgress(state);
    return state;
  }
  if (!response.body) throw new Error('AI service returned no response');
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (block: string) => {
    const lines = block.split(/\r\n|\n|\r/);
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data || data.trim() === '[DONE]') return;
    const event =
      lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim() ?? '';
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      value = data;
    }
    state = applyLlmEvent(state, value, event);
    onProgress(state);
  };
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (buffer.length > 2 * 1024 * 1024) throw new Error('AI response exceeded limit');
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    return state;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
