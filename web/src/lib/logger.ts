export type LogFields = Record<string, unknown>;

function normalizeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function write(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: LogFields = {}) {
  if (import.meta.env.PROD && level === 'debug') return;
  const payload = { event, ...fields };
  const output = console[level];
  output(`[${event}]`, payload);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write('debug', event, fields),
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, error?: unknown, fields: LogFields = {}) =>
    write('error', event, { ...fields, error: normalizeError(error) }),
};
