import { afterEach, describe, expect, it } from "vitest";
import { AiError } from "@/server/ai/errors";
import { AnthropicProvider, parseRetryAfter } from "@/server/ai/providers/anthropic";
import { PROMPTS } from "@/server/ai/prompts";
import { buildSystemPrompt } from "@/server/ai/prompts/shared";
import { runPrompt } from "@/server/ai/run";
import type { LlmRequest } from "@/server/ai/types";
import { TEST_CONFIG, aiContext, captureLogs, fakeClock, memoryRecorder } from "./helpers";

/**
 * The adapter is exercised against a fake fetch that returns Anthropic-shaped HTTP
 * responses. No request leaves the machine and no credentials are needed.
 */
const API_KEY = "sk-ant-api03-unit-test-key-AAAAAAAAAAAAAAAAAAAA";
const classifier = PROMPTS.reply_classifier;
const output = { intent: "interested", confidence: 0.8, rationale: "Positive reply.", requiresHuman: false, optOutRequested: false };

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "request-id": "req_test_123", ...headers },
  });
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(output) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 },
    ...overrides,
  };
}

function apiError(status: number, type: string, text: string, headers: Record<string, string> = {}) {
  return jsonResponse(status, { type: "error", error: { type, message: text } }, headers);
}

function fakeFetch(responder: (call: Captured, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const call: Captured = {
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    };
    calls.push(call);
    return responder(call, init);
  };
  return { calls, fetch: fn as unknown as typeof fetch };
}

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    promptId: classifier.id,
    promptVersion: classifier.version,
    system: buildSystemPrompt(classifier),
    user: classifier.buildUser(classifier.example),
    outputSchema: classifier.outputSchema,
    maxTokens: classifier.maxTokens,
    effort: classifier.effort,
    timeoutMs: 5_000,
    ...overrides,
  };
}

async function failure(fetchImpl: typeof fetch, req: LlmRequest = request()): Promise<AiError> {
  const provider = new AnthropicProvider({ apiKey: API_KEY, model: "claude-opus-5-5", fetch: fetchImpl });
  try {
    await provider.generate(req);
  } catch (error) {
    if (error instanceof AiError) return error;
    throw error;
  }
  throw new Error("expected the provider to fail");
}

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("Anthropic adapter: request", () => {
  it("sends a structured-output Messages request with the documented shape", async () => {
    const { calls, fetch } = fakeFetch(() => jsonResponse(200, message()));
    const provider = new AnthropicProvider({ apiKey: API_KEY, model: "claude-opus-5-5", fetch });
    const response = await provider.generate(request());

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toMatch(/\/v1\/messages(\?|$)/);
    // SDK 1.x sends the key as a bearer token. It must be HUNTER's configured key,
    // never an ambient credential from the server environment.
    expect(call.headers.get("authorization")).toBe(`Bearer ${API_KEY}`);
    expect(call.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(call.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: classifier.maxTokens,
      system: buildSystemPrompt(classifier),
      fallbacks: "default",
      messages: [{ role: "user", content: classifier.buildUser(classifier.example) }],
    });
    const config = call.body.output_config as { effort: string; format: { type: string; schema: { additionalProperties?: boolean } } };
    expect(config.effort).toBe(classifier.effort);
    expect(config.format.type).toBe("json_schema");
    expect(config.format.schema.additionalProperties).toBe(false);
    // Current models reject sampling parameters and fixed thinking budgets.
    for (const forbidden of ["temperature", "top_p", "top_k", "thinking", "betas"]) expect(call.body).not.toHaveProperty(forbidden);

    expect(response).toEqual({
      text: JSON.stringify(output),
      model: "claude-opus-5-5",
      stopReason: "end_turn",
      usage: { inputTokens: 1200, outputTokens: 300, cacheReadInputTokens: 40, cacheCreationInputTokens: 0 },
      providerRequestId: "req_test_123",
    });
  });

  it("joins multiple text blocks and ignores thinking blocks", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(200, message({ content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: '{"a":' }, { type: "text", text: "1}" }] })),
    );
    const provider = new AnthropicProvider({ apiKey: API_KEY, model: "claude-opus-5-5", fetch });
    expect((await provider.generate(request())).text).toBe('{"a":1}');
  });
});

describe("Anthropic adapter: error classification", () => {
  it("maps 429 to a retryable rate limit with retry-after", async () => {
    const error = await failure(fakeFetch(() => apiError(429, "rate_limit_error", "Too many requests", { "retry-after": "7" })).fetch);
    expect(error).toMatchObject({ kind: "rate_limited", retryable: true, retryAfterMs: 7_000, status: 429, providerRequestId: "req_test_123" });
  });

  it.each([
    [529, "overloaded_error"],
    [500, "api_error"],
    [503, "api_error"],
  ])("maps %i to a retryable provider_unavailable", async (status, type) => {
    const error = await failure(fakeFetch(() => apiError(status, type, "Service problem")).fetch);
    expect(error).toMatchObject({ kind: "provider_unavailable", retryable: true, status });
  });

  it.each([
    [401, "authentication_error", "authentication"],
    [403, "permission_error", "authentication"],
    [400, "invalid_request_error", "provider_rejected"],
    [404, "not_found_error", "provider_rejected"],
    [413, "request_too_large", "provider_rejected"],
  ])("maps %i to a non-retryable %s", async (status, type, kind) => {
    const error = await failure(fakeFetch(() => apiError(status, type, "Rejected")).fetch);
    expect(error).toMatchObject({ kind, retryable: false, status });
  });

  it("maps a network failure to a retryable network error", async () => {
    const error = await failure(
      fakeFetch(() => {
        throw new TypeError("fetch failed");
      }).fetch,
    );
    expect(error).toMatchObject({ kind: "network", retryable: true });
  });

  it("maps a slow response to a retryable timeout", async () => {
    const { fetch } = fakeFetch(
      (_call, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        }),
    );
    const error = await failure(fetch, request({ timeoutMs: 50 }));
    expect(error).toMatchObject({ kind: "timeout", retryable: true });
  });

  it("maps a refusal stop reason to refused, with its category", async () => {
    const { fetch } = fakeFetch(() =>
      jsonResponse(200, message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "" }, content: [] })),
    );
    const error = await failure(fetch);
    expect(error).toMatchObject({ kind: "refused", retryable: false });
    expect(error.message).toContain("cyber");
    expect(error.usage?.inputTokens).toBe(1200);
  });

  it("maps max_tokens to truncated", async () => {
    const error = await failure(fakeFetch(() => jsonResponse(200, message({ stop_reason: "max_tokens" }))).fetch);
    expect(error).toMatchObject({ kind: "truncated", retryable: false });
  });

  it("never puts the API key in an error message", async () => {
    process.env.ANTHROPIC_API_KEY = API_KEY;
    const error = await failure(fakeFetch(() => apiError(400, "invalid_request_error", `Key ${API_KEY} is malformed`)).fetch);
    expect(error.message).not.toContain(API_KEY);
    expect(error.message).toContain("[redacted]");
  });

  it("parses retry-after in seconds or as an HTTP date", () => {
    expect(parseRetryAfter("3")).toBe(3_000);
    expect(parseRetryAfter("0.5")).toBe(500);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("Anthropic adapter through the runner", () => {
  it("recovers from a rate limit by honouring retry-after, and records the real model and usage", async () => {
    let call = 0;
    const { calls, fetch } = fakeFetch(() =>
      ++call === 1 ? apiError(429, "rate_limit_error", "Slow down", { "retry-after": "2" }) : jsonResponse(200, message()),
    );
    const clock = fakeClock();
    const { records, recorder } = memoryRecorder();
    const provider = new AnthropicProvider({ apiKey: API_KEY, model: "claude-opus-5-5", fetch });
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder), {
      provider,
      config: TEST_CONFIG,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([2_000]);
    expect(records[0]).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", synthetic: false, attempts: 2 });
    expect(records[0].usage?.inputTokens).toBe(1200);
  });

  it("never logs the API key, even on authentication failure", async () => {
    process.env.ANTHROPIC_API_KEY = API_KEY;
    const logs = captureLogs();
    try {
      const { fetch } = fakeFetch(() => apiError(401, "authentication_error", `invalid x-api-key ${API_KEY}`));
      const { records, recorder } = memoryRecorder();
      const provider = new AnthropicProvider({ apiKey: API_KEY, model: "claude-opus-5-5", fetch });
      const result = await runPrompt(classifier, classifier.example, aiContext(recorder), { provider, config: TEST_CONFIG });
      expect(!result.ok && result.error.kind).toBe("authentication");
      expect(JSON.stringify(logs.records)).not.toContain(API_KEY);
      expect(JSON.stringify(records)).not.toContain(API_KEY);
      expect(JSON.stringify(result)).not.toContain(API_KEY);
    } finally {
      logs.stop();
    }
  });
});
