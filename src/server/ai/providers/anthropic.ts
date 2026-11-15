import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { redactText } from "@/server/logger";
import { AiError } from "../errors";
import type { LlmProvider, LlmRequest, LlmResponse, LlmUsage } from "../types";

/** Re-runs a safety-declined request on Anthropic's recommended fallback model, server-side. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Injected in tests. Production uses the global fetch. */
  fetch?: typeof fetch;
  baseURL?: string;
}

/** Parses a retry-after header given in seconds or as an HTTP date. */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

function safeDetail(error: { message?: unknown }): string {
  return redactText(String(error.message ?? "")).slice(0, 300);
}

/** Maps SDK errors to AiError, most specific class first. */
export function classifyAnthropicError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  if (error instanceof Anthropic.APIUserAbortError) {
    return new AiError("deadline_exceeded", "The request was cancelled before the provider responded.", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("timeout", "The provider did not respond within the time limit.", { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("network", `Could not reach the provider: ${safeDetail(error)}`, { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : null;
    const providerRequestId = error.requestID ?? null;
    const retryAfterMs = parseRetryAfter(error.headers?.get("retry-after"));
    const common = { status, providerRequestId, cause: error };

    if (error instanceof Anthropic.RateLimitError) {
      return new AiError("rate_limited", "The provider rate limit was reached.", { ...common, retryAfterMs });
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return new AiError("authentication", "The provider rejected the API key or its permissions.", common);
    }
    if (error instanceof Anthropic.InternalServerError) {
      return new AiError("provider_unavailable", `The provider is temporarily unavailable (HTTP ${status}).`, {
        ...common,
        retryAfterMs,
      });
    }
    if (status === 408) {
      return new AiError("timeout", "The provider timed out handling the request.", common);
    }
    const type = error.type ? `, ${error.type}` : "";
    return new AiError("provider_rejected", `The provider rejected the request (HTTP ${status}${type}): ${safeDetail(error)}`, common);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiError("unknown", `Unexpected error from the provider: ${redactText(message).slice(0, 300)}`, { cause: error });
}

/**
 * Anthropic Claude adapter, built on the official SDK.
 *
 * - SDK retries are disabled; HUNTER's runner owns retries, so every attempt is
 *   counted, logged and bounded in one place.
 * - The response format is the prompt's Zod schema, sent as structured output.
 *   The runner still parses and validates the text itself.
 * - Thinking is left at the model default (adaptive); effort is set per prompt.
 * - No sampling parameters are sent: current models reject them.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic" as const;
  readonly synthetic = false;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: 0,
      fetch: options.fetch,
      baseURL: options.baseURL,
    });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    let response;
    try {
      response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: { effort: request.effort, format: zodOutputFormat(request.outputSchema) },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        },
        { timeout: request.timeoutMs, signal: request.signal },
      );
    } catch (error) {
      throw classifyAnthropicError(error);
    }

    const providerRequestId = response._request_id ?? null;
    const usage: LlmUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category;
      throw new AiError("refused", `The model declined the request${category ? ` (category: ${category})` : ""}.`, {
        providerRequestId,
        usage,
      });
    }
    if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") {
      throw new AiError("truncated", "The response reached the token limit before it was complete.", {
        providerRequestId,
        usage,
        rawText: text,
      });
    }

    return { text, model: response.model, stopReason: response.stop_reason, usage, providerRequestId };
  }
}
