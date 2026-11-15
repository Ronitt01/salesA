import "server-only";
import { AiError } from "./errors";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { MOCK_MODEL, MockProvider } from "./providers/mock";
import type { LlmProvider, ProviderName } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export interface AiConfig {
  provider: ProviderName;
  model: string;
  /** Server-side only. Never logged, stored or returned. */
  apiKey: string | null;
  /** Limit for one attempt. */
  timeoutMs: number;
  /** Limit for the whole call, retries included. */
  totalTimeoutMs: number;
  /** Total attempts for transient failures (1 = no retry). */
  maxAttempts: number;
  /** A provider asking us to wait longer than this fails the call instead of waiting. */
  maxRetryDelayMs: number;
}

type Env = Record<string, string | undefined>;

function wholeNumber(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AiError("configuration", `${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Reads AI settings from the environment.
 *
 * LLM_PROVIDER selects the provider: "mock" (the default when unset), "anthropic" or "gemini".
 * A misconfigured provider is an error. HUNTER never silently switches to the mock.
 */
export function loadAiConfig(env: Env = process.env): AiConfig {
  const limits = {
    timeoutMs: wholeNumber(env, "LLM_TIMEOUT_MS", 120_000, 1_000, 600_000),
    totalTimeoutMs: wholeNumber(env, "LLM_TOTAL_TIMEOUT_MS", 300_000, 1_000, 1_800_000),
    maxAttempts: wholeNumber(env, "LLM_MAX_ATTEMPTS", 3, 1, 5),
    maxRetryDelayMs: wholeNumber(env, "LLM_MAX_RETRY_DELAY_MS", 30_000, 0, 300_000),
  };
  const requested = (env.LLM_PROVIDER ?? "").trim().toLowerCase() || "mock";

  switch (requested) {
    case "mock":
      return { provider: "mock", model: MOCK_MODEL, apiKey: null, ...limits };
    case "anthropic": {
      const apiKey = env.ANTHROPIC_API_KEY?.trim();
      if (!apiKey) {
        throw new AiError(
          "configuration",
          "LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set. HUNTER does not fall back to the mock provider.",
        );
      }
      return { provider: "anthropic", model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL, apiKey, ...limits };
    }
    case "gemini": {
      const apiKey = env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new AiError(
          "configuration",
          "LLM_PROVIDER is gemini but GEMINI_API_KEY is not set. HUNTER does not fall back to another provider.",
        );
      }
      return { provider: "gemini", model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, apiKey, ...limits };
    }
    case "openai":
      throw new AiError("configuration", "The OpenAI provider is not implemented yet. Set LLM_PROVIDER to anthropic, gemini or mock.");
    default:
      throw new AiError("configuration", `Unknown LLM_PROVIDER "${requested.slice(0, 40)}". Use anthropic, gemini or mock.`);
  }
}

export function createProvider(config: AiConfig, deps: { fetch?: typeof fetch } = {}): LlmProvider {
  switch (config.provider) {
    case "anthropic":
      if (!config.apiKey) throw new AiError("configuration", "The Anthropic provider needs an API key.");
      return new AnthropicProvider({ apiKey: config.apiKey, model: config.model, fetch: deps.fetch });
    case "gemini":
      if (!config.apiKey) throw new AiError("configuration", "The Gemini provider needs an API key.");
      return new GeminiProvider({ apiKey: config.apiKey, model: config.model, fetch: deps.fetch });
    case "mock":
      return new MockProvider();
  }
}

/** The provider name to record when configuration fails before a provider exists. */
export function requestedProviderName(env: Env = process.env): "mock" | "anthropic" | "gemini" | "openai" | "unconfigured" {
  const requested = (env.LLM_PROVIDER ?? "").trim().toLowerCase() || "mock";
  return requested === "mock" || requested === "anthropic" || requested === "gemini" || requested === "openai" ? requested : "unconfigured";
}
