import { describe, expect, it } from "vitest";
import { DEFAULT_ANTHROPIC_MODEL, createProvider, loadAiConfig, requestedProviderName } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { AnthropicProvider } from "@/server/ai/providers/anthropic";
import { MockProvider } from "@/server/ai/providers/mock";

function configError(env: Record<string, string | undefined>): AiError {
  try {
    loadAiConfig(env);
  } catch (error) {
    if (error instanceof AiError) return error;
    throw error;
  }
  throw new Error("expected a configuration error");
}

describe("provider selection", () => {
  it("uses the mock provider when LLM_PROVIDER is unset or mock", () => {
    for (const env of [{}, { LLM_PROVIDER: "" }, { LLM_PROVIDER: "mock" }, { LLM_PROVIDER: " MOCK " }]) {
      const config = loadAiConfig(env);
      expect(config.provider).toBe("mock");
      expect(config.apiKey).toBeNull();
      expect(createProvider(config)).toBeInstanceOf(MockProvider);
    }
  });

  it("selects Anthropic with the default model when a key is set", () => {
    const config = loadAiConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test-0000000000" });
    expect(config).toMatchObject({ provider: "anthropic", model: DEFAULT_ANTHROPIC_MODEL });
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    const provider = createProvider(config);
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.synthetic).toBe(false);
  });

  it("honours ANTHROPIC_MODEL", () => {
    const config = loadAiConfig({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k-123456789", ANTHROPIC_MODEL: "claude-sonnet-5-5" });
    expect(config.model).toBe("claude-sonnet-5-5");
  });

  it("refuses Anthropic without a key instead of falling back to the mock", () => {
    for (const key of [undefined, "", "   "]) {
      const error = configError({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: key });
      expect(error.kind).toBe("configuration");
      expect(error.message).toContain("does not fall back to the mock provider");
    }
  });

  it("reports OpenAI as not implemented, and unknown providers as errors", () => {
    expect(configError({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "x" }).message).toContain("not implemented");
    expect(configError({ LLM_PROVIDER: "gemini" }).message).toContain("Unknown LLM_PROVIDER");
  });

  it("validates numeric limits", () => {
    expect(loadAiConfig({ LLM_MAX_ATTEMPTS: "5", LLM_TIMEOUT_MS: "30000" })).toMatchObject({ maxAttempts: 5, timeoutMs: 30_000 });
    expect(configError({ LLM_MAX_ATTEMPTS: "9" }).message).toContain("LLM_MAX_ATTEMPTS");
    expect(configError({ LLM_TIMEOUT_MS: "fast" }).message).toContain("LLM_TIMEOUT_MS");
  });

  it("knows which provider was requested even when configuration fails", () => {
    expect(requestedProviderName({ LLM_PROVIDER: "anthropic" })).toBe("anthropic");
    expect(requestedProviderName({})).toBe("mock");
    expect(requestedProviderName({ LLM_PROVIDER: "something" })).toBe("unconfigured");
  });
});
