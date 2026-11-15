import "server-only";

/**
 * Structured logger. One JSON object per line, with secrets redacted.
 *
 * Redaction removes the values of known secret environment variables, strings that
 * look like API keys or JWTs, and the value of any field whose name suggests a secret.
 * Callers must still never pass prompts, page text or message bodies: log identifiers,
 * counts and outcomes, not content.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  level: LogLevel;
  scope: string;
  message: string;
  time: string;
  [field: string]: unknown;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// Field names that hold secrets. "token" alone is matched only as a whole name or with
// an auth prefix, so usage counters such as inputTokens are not masked.
const SECRET_FIELD =
  /(api[-_]?key|secret|password|passwd|authorization|cookie|service[-_]?role|credential)|^((access|refresh|auth|bearer|id|session)[-_]?)?token$/i;
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  // Google API keys.
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  // Credentials passed as a query parameter, e.g. Hunter.io's api_key.
  /(?<=[?&](?:api_key|apikey|key|token)=)[^&\s"'#]+/gi,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];
const SECRET_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "HUNTER_API_KEY",
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "N8N_WEBHOOK_SECRET",
  "DEMO_USER_PASSWORD",
];

export function redactText(text: string): string {
  let out = text;
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  }
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redactText(value);
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_FIELD.test(key) ? "[redacted]" : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

type Sink = (record: LogRecord) => void;

const consoleSink: Sink = (record) => {
  const line = JSON.stringify(record);
  if (record.level === "error" || record.level === "warn") console.error(line);
  else console.log(line);
};

let customSink: Sink | null = null;

/** Replace the output destination, for tests. A custom sink receives every level. */
export function setLogSink(sink: Sink | null): void {
  customSink = sink;
}

function minimumLevel(): LogLevel | "silent" {
  const configured = process.env.LOG_LEVEL;
  if (configured === "silent") return "silent";
  if (configured && configured in ORDER) return configured as LogLevel;
  // Keep test output readable unless a test asks for logs.
  return process.env.VITEST ? "silent" : "info";
}

function write(level: LogLevel, scope: string, message: string, fields: Record<string, unknown> = {}): void {
  const record = {
    ...(redact(fields) as Record<string, unknown>),
    level,
    scope,
    message: redactText(message),
    time: new Date().toISOString(),
  } satisfies LogRecord;

  if (customSink) {
    customSink(record);
    return;
  }
  const min = minimumLevel();
  if (min === "silent" || ORDER[level] < ORDER[min]) return;
  consoleSink(record);
}

export const logger = {
  debug: (scope: string, message: string, fields?: Record<string, unknown>) => write("debug", scope, message, fields),
  info: (scope: string, message: string, fields?: Record<string, unknown>) => write("info", scope, message, fields),
  warn: (scope: string, message: string, fields?: Record<string, unknown>) => write("warn", scope, message, fields),
  error: (scope: string, message: string, fields?: Record<string, unknown>) => write("error", scope, message, fields),
};
