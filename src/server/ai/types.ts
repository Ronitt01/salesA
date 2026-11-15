import type { z } from "zod";

/** How much reasoning effort the model should spend. Maps to Anthropic's output_config.effort and Gemini's thinking level. */
export type Effort = "low" | "medium" | "high";

export type ProviderName = "mock" | "anthropic" | "gemini";

/** One structured-output request to a model. Providers never see raw HUNTER objects. */
export interface LlmRequest {
  promptId: string;
  promptVersion: string;
  /** Instructions only. Untrusted content never goes here. */
  system: string;
  /** Task input. Untrusted content appears only inside delimited blocks. */
  user: string;
  /** The schema the response must satisfy. */
  outputSchema: z.ZodType;
  maxTokens: number;
  effort: Effort;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Deterministic output for the mock provider. Real providers ignore it. */
  fixture?: () => unknown;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface LlmResponse {
  /** The response text, expected to be one JSON value. */
  text: string;
  /** The model that actually served the request (a server-side fallback can differ). */
  model: string;
  stopReason: string | null;
  /** Null when the provider does not report usage. */
  usage: LlmUsage | null;
  providerRequestId: string | null;
}

/**
 * A model provider. Adapters translate one LlmRequest into one API call and translate
 * every failure into an AiError. They do not retry; the runner owns retries.
 */
export interface LlmProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** True when output is synthetic (the mock). Synthetic output is never research. */
  readonly synthetic: boolean;
  generate(request: LlmRequest): Promise<LlmResponse>;
}
