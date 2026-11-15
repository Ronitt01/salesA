import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { redactText } from "@/server/logger";
import { AiError } from "../errors";
import type { Effort, LlmProvider, LlmRequest, LlmResponse, LlmUsage } from "../types";

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  /** Injected in tests. Production uses the global fetch. */
  fetch?: typeof fetch;
  baseUrl?: string;
}

const EFFORT_TO_THINKING: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Finish reasons that mean the model declined on safety or policy grounds. */
const REFUSAL_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
]);

/**
 * JSON Schema keywords the Gemini API accepts in responseJsonSchema, per the SDK's
 * documentation. Everything else (minLength, maxLength, pattern, $schema, ...) is
 * removed from the copy sent to the API. HUNTER's Zod schema still enforces the full
 * contract on the response.
 */
const SUPPORTED_KEYWORDS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

function reduceSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(reduceSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "properties" || key === "$defs") {
      out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, reduceSchema(child)]));
    } else if (key === "enum" || key === "required" || key === "propertyOrdering") {
      out[key] = value;
    } else {
      out[key] = reduceSchema(value);
    }
  }
  return out;
}

/** The prompt's Zod output schema as a JSON Schema the Gemini API accepts. */
export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  return reduceSchema(z.toJSONSchema(schema, { unrepresentable: "any" }));
}

/** Reads the retry delay Gemini puts in a 429 body (google.rpc.RetryInfo, e.g. "7s"). */
export function parseGeminiRetryDelay(errorMessage: string): number | null {
  try {
    const body = JSON.parse(errorMessage) as { error?: { details?: Array<{ retryDelay?: unknown }> } };
    for (const detail of body.error?.details ?? []) {
      const match = typeof detail.retryDelay === "string" ? detail.retryDelay.match(/^(\d+(?:\.\d+)?)s$/) : null;
      if (match) return Math.round(Number(match[1]) * 1000);
    }
  } catch {
    // Not a JSON error body.
  }
  return null;
}

function errorBody(message: string): { text: string; status: string | null } {
  try {
    const body = JSON.parse(message) as { error?: { message?: unknown; status?: unknown } };
    return {
      text: typeof body.error?.message === "string" ? body.error.message : message,
      status: typeof body.error?.status === "string" ? body.error.status : null,
    };
  } catch {
    return { text: message, status: null };
  }
}

/** Maps Gemini SDK errors to AiError. Aborts are classified by the caller, which knows why it aborted. */
export function classifyGeminiError(error: unknown): AiError {
  if (error instanceof AiError) return error;

  if (error instanceof ApiError) {
    const status = error.status;
    const body = errorBody(error.message);
    const detail = redactText(body.text).slice(0, 300);
    const common = { status, cause: error };

    if (status === 429) {
      return new AiError("rate_limited", "The provider rate limit was reached.", { ...common, retryAfterMs: parseGeminiRetryDelay(error.message) });
    }
    if (status === 401 || status === 403 || /api key/i.test(body.text)) {
      return new AiError("authentication", "The provider rejected the API key or its permissions.", common);
    }
    if (status === 408) return new AiError("timeout", "The provider timed out handling the request.", common);
    if (status >= 500) return new AiError("provider_unavailable", `The provider is temporarily unavailable (HTTP ${status}).`, common);
    const kind = body.status ? `, ${body.status}` : "";
    return new AiError("provider_rejected", `The provider rejected the request (HTTP ${status}${kind}): ${detail}`, common);
  }
  if (error instanceof TypeError) {
    return new AiError("network", `Could not reach the provider: ${redactText(error.message).slice(0, 300)}`, { cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AiError("unknown", `Unexpected error from the provider: ${redactText(message).slice(0, 300)}`, { cause: error });
}

/**
 * Google Gemini adapter, built on the official @google/genai SDK.
 *
 * - Gemini Developer API with an explicit API key. Vertex AI mode is switched off
 *   explicitly so no ambient Google Cloud credentials or environment flags are used.
 * - SDK retries are disabled (attempts: 1); HUNTER's runner owns retries.
 * - The timeout is HUNTER's own abort timer, so a timeout and a cancellation are
 *   reported differently.
 * - The response format is the prompt's Zod schema as JSON Schema. The runner still
 *   parses and validates the text itself.
 * - Per-prompt effort maps to Gemini's thinking level. Thoughts are not returned.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;
  readonly synthetic = false;
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      vertexai: false,
      httpOptions: {
        retryOptions: { attempts: 1 },
        fetch: options.fetch,
        baseUrl: options.baseUrl,
      },
    });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);
    const onCallerAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiJsonSchema(request.outputSchema),
          maxOutputTokens: request.maxTokens,
          thinkingConfig: { thinkingLevel: EFFORT_TO_THINKING[request.effort], includeThoughts: false },
          abortSignal: controller.signal,
        },
      });
    } catch (error) {
      if (timedOut) throw new AiError("timeout", "The provider did not respond within the time limit.", { cause: error });
      if (request.signal?.aborted) throw new AiError("deadline_exceeded", "The request was cancelled before the provider responded.", { cause: error });
      throw classifyGeminiError(error);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }

    const providerRequestId = response.responseId ?? null;
    const metadata = response.usageMetadata;
    const usage: LlmUsage | null = metadata
      ? {
          inputTokens: metadata.promptTokenCount ?? 0,
          // Thinking tokens are billed as output, so they are counted as output here.
          outputTokens: (metadata.candidatesTokenCount ?? 0) + (metadata.thoughtsTokenCount ?? 0),
          cacheReadInputTokens: metadata.cachedContentTokenCount ?? 0,
          cacheCreationInputTokens: 0,
        }
      : null;

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new AiError("refused", `The provider blocked the request (reason: ${blockReason}).`, { providerRequestId, usage });
    }

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ?? null;
    const text = (candidate?.content?.parts ?? [])
      .flatMap((part) => (typeof part.text === "string" && part.thought !== true ? [part.text] : []))
      .join("");

    if (finishReason && REFUSAL_REASONS.has(finishReason)) {
      throw new AiError("refused", `The model declined the request (reason: ${finishReason}).`, { providerRequestId, usage });
    }
    if (finishReason === "MAX_TOKENS") {
      throw new AiError("truncated", "The response reached the token limit before it was complete.", { providerRequestId, usage, rawText: text });
    }
    if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_UNSPECIFIED") {
      throw new AiError("provider_rejected", `The model stopped generating (reason: ${finishReason}).`, { providerRequestId, usage, rawText: text });
    }

    return {
      text,
      model: response.modelVersion ?? this.model,
      stopReason: finishReason,
      usage,
      providerRequestId,
    };
  }
}
