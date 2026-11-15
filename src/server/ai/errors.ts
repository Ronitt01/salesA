import { redactText } from "@/server/logger";
import type { LlmUsage } from "./types";

/**
 * Every failure in the AI layer is an AiError with a kind. The kind decides whether
 * the runner retries, and is stored on the execution record.
 */
export type AiErrorKind =
  /** Provider selection or settings are wrong. Never retried, never replaced by the mock. */
  | "configuration"
  /** The input failed its schema. Nothing was sent to a provider. */
  | "input_rejected"
  | "timeout"
  | "network"
  | "rate_limited"
  /** 5xx or overloaded. */
  | "provider_unavailable"
  /** The provider refused the request as invalid (400, 404, 413, ...). */
  | "provider_rejected"
  | "authentication"
  /** The model declined on safety grounds. */
  | "refused"
  /** The response hit the token limit. */
  | "truncated"
  | "invalid_json"
  | "schema_validation"
  /** The output parsed but broke a rule, such as a quote that is not in the source page. */
  | "guard_failed"
  /** The overall time budget ran out. */
  | "deadline_exceeded"
  | "unknown";

const TRANSIENT: ReadonlySet<AiErrorKind> = new Set(["timeout", "network", "rate_limited", "provider_unavailable"]);
const REPAIRABLE: ReadonlySet<AiErrorKind> = new Set(["invalid_json", "schema_validation", "guard_failed"]);

export interface AiErrorOptions {
  retryAfterMs?: number | null;
  status?: number | null;
  providerRequestId?: string | null;
  details?: string[];
  /** Tokens spent on the failed attempt, when the provider reported them. */
  usage?: LlmUsage | null;
  /** The unusable response text, for the debug excerpt. */
  rawText?: string | null;
  cause?: unknown;
}

export class AiError extends Error {
  override name = "AiError";
  readonly kind: AiErrorKind;
  /** True for transient failures that a later attempt may not hit. */
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly status: number | null;
  readonly providerRequestId: string | null;
  readonly details: string[];
  readonly usage: LlmUsage | null;
  readonly rawText: string | null;

  constructor(kind: AiErrorKind, message: string, options: AiErrorOptions = {}) {
    super(redactText(message), { cause: options.cause });
    this.kind = kind;
    this.retryable = TRANSIENT.has(kind);
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.status = options.status ?? null;
    this.providerRequestId = options.providerRequestId ?? null;
    this.details = (options.details ?? []).map((d) => redactText(d));
    this.usage = options.usage ?? null;
    this.rawText = options.rawText ?? null;
  }
}

/** Output problems where asking once more can help. */
export function isRepairable(kind: AiErrorKind): boolean {
  return REPAIRABLE.has(kind);
}

export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AiError("unknown", `Unexpected error in the AI layer: ${message.slice(0, 300)}`, { cause: error });
}
