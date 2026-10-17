type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

/** Deep-copies a value, replacing anything under a sensitive-looking key with "[REDACTED]". */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(v),
      ]),
    );
  }
  return value;
}

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold()) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const payload = context ? ` ${JSON.stringify(redact(context))}` : '';
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(line + payload);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
