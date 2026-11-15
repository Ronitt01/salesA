import { afterEach, describe, expect, it } from "vitest";
import { AiError } from "@/server/ai/errors";
import { MockProvider } from "@/server/ai/providers/mock";
import { PROMPTS, PROMPT_LIST, type AnyPrompt } from "@/server/ai/prompts";
import { runPrompt } from "@/server/ai/run";
import { ScriptedProvider, TENANT, TEST_CONFIG, aiContext, captureLogs, fakeClock, memoryRecorder } from "./helpers";

const classifier = PROMPTS.reply_classifier;
const valid = JSON.stringify({
  intent: "wants_meeting",
  confidence: 0.9,
  rationale: "The sender asks for a call next week.",
  requiresHuman: false,
  optOutRequested: false,
});

function run(prompt: AnyPrompt, provider: ScriptedProvider | MockProvider, input: unknown = prompt.example) {
  const { records, recorder } = memoryRecorder();
  const clock = fakeClock();
  const promise = runPrompt(prompt, input, aiContext(recorder), {
    provider,
    config: TEST_CONFIG,
    now: clock.now,
    sleep: clock.sleep,
    random: () => 1,
  });
  return { promise, records, clock };
}

let logs: ReturnType<typeof captureLogs> | null = null;
afterEach(() => {
  logs?.stop();
  logs = null;
  delete process.env.LLM_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("mock provider execution", () => {
  it.each(PROMPT_LIST.map((p) => [p.id, p] as const))("%s returns schema-valid, labelled synthetic output", async (_id, prompt) => {
    const { promise, records } = run(prompt, new MockProvider());
    const result = await promise;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(prompt.outputSchema.safeParse(result.data).success).toBe(true);
    expect(JSON.stringify(result.data)).toMatch(/synthetic/i);
    expect(result.meta).toMatchObject({ provider: "mock", model: "hunter-mock-1", synthetic: true, attempts: 1, usage: null });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: "succeeded", synthetic: true, tenantId: TENANT, promptVersion: prompt.version });
  });

  it("is deterministic", async () => {
    const first = await run(classifier, new MockProvider()).promise;
    const second = await run(classifier, new MockProvider()).promise;
    expect(first.ok && second.ok && first.data).toEqual(second.ok && second.data);
  });

  it("uses the mock when LLM_PROVIDER is unset, without any credentials", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder));
    expect(result.ok).toBe(true);
    expect(result.meta.provider).toBe("mock");
  });
});

describe("structured responses", () => {
  it("returns validated data, usage and the provider request id", async () => {
    const { promise, records } = run(classifier, new ScriptedProvider([valid]));
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.intent).toBe("wants_meeting");
    expect(result.meta.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });
    expect(records[0]).toMatchObject({ status: "succeeded", providerRequestId: "req_1", attempts: 1 });
    expect(records[0].output).toEqual(JSON.parse(valid));
  });

  it("accepts JSON wrapped in a code fence", async () => {
    const result = await run(classifier, new ScriptedProvider(["```json\n" + valid + "\n```"])).promise;
    expect(result.ok).toBe(true);
  });

  it("rejects invalid input without calling the provider", async () => {
    const provider = new ScriptedProvider([valid]);
    const { promise, records } = run(classifier, provider, { latestMessage: { text: "" }, priorMessages: [] });
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("input_rejected");
    expect(!result.ok && result.error.details[0]).toContain("latestMessage.text");
    expect(provider.requests).toHaveLength(0);
    expect(records[0]).toMatchObject({ status: "failed", errorKind: "input_rejected", attempts: 0 });
  });

  it("rejects over-long untrusted input instead of truncating it", async () => {
    const provider = new ScriptedProvider([valid]);
    const result = await run(classifier, provider, { latestMessage: { text: "x".repeat(10_001) }, priorMessages: [] }).promise;
    expect(!result.ok && result.error.kind).toBe("input_rejected");
    expect(provider.requests).toHaveLength(0);
  });

  it("rejects a context without a valid tenant", async () => {
    const { recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, { ...aiContext(recorder), tenantId: "not-a-tenant" }, { provider: new MockProvider() });
    expect(!result.ok && result.error.kind).toBe("input_rejected");
  });
});

describe("invalid output handling", () => {
  it("retries once after invalid JSON and succeeds", async () => {
    const provider = new ScriptedProvider(["Sure! Here is the answer:", valid]);
    const result = await run(classifier, provider).promise;
    expect(result.ok).toBe(true);
    expect(result.meta.attempts).toBe(2);
    expect(result.meta.usage?.inputTokens).toBe(200);
  });

  it("fails with invalid_json after one repair attempt, keeping a redacted excerpt", async () => {
    const { promise, records } = run(classifier, new ScriptedProvider(["not json at all"]));
    const result = await promise;
    expect(!result.ok && result.error.kind).toBe("invalid_json");
    expect(result.meta.attempts).toBe(2);
    expect(records[0]).toMatchObject({ status: "failed", errorKind: "invalid_json", rawExcerpt: "not json at all", output: null });
  });

  it("fails Zod validation with path-level details and no values", async () => {
    const wrong = JSON.stringify({ intent: "very_interested", confidence: 3, rationale: "x", requiresHuman: false, optOutRequested: false });
    const result = await run(classifier, new ScriptedProvider([wrong])).promise;
    expect(!result.ok && result.error.kind).toBe("schema_validation");
    const details = !result.ok ? result.error.details.join(" ") : "";
    expect(details).toContain("intent");
    expect(details).toContain("confidence");
    expect(details).not.toContain("very_interested");
  });

  it("rejects extra fields, so a model cannot add a score or a qualification", async () => {
    const extra = JSON.stringify({ ...JSON.parse(valid), qualified: true, score: 100 });
    const result = await run(classifier, new ScriptedProvider([extra])).promise;
    expect(!result.ok && result.error.kind).toBe("schema_validation");
  });

  it("enforces guards after schema validation", async () => {
    const inconsistent = JSON.stringify({ ...JSON.parse(valid), intent: "unsubscribe", optOutRequested: false });
    const result = await run(classifier, new ScriptedProvider([inconsistent])).promise;
    expect(!result.ok && result.error.kind).toBe("guard_failed");
    expect(!result.ok && result.error.details[0]).toContain("optOutRequested");
  });
});

describe("provider failures", () => {
  it("waits for retry-after on a rate limit, then succeeds", async () => {
    const provider = new ScriptedProvider([new AiError("rate_limited", "Rate limited.", { status: 429, retryAfterMs: 2_000 }), valid]);
    const { promise, clock } = run(classifier, provider);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(clock.sleeps).toEqual([2_000]);
    expect(result.meta.attempts).toBe(2);
  });

  it("does not wait when retry-after exceeds the limit", async () => {
    const provider = new ScriptedProvider([new AiError("rate_limited", "Rate limited.", { status: 429, retryAfterMs: 120_000 }), valid]);
    const { promise, clock } = run(classifier, provider);
    const result = await promise;
    expect(!result.ok && result.error.kind).toBe("rate_limited");
    expect(!result.ok && result.error.message).toContain("exceeds the retry limit");
    expect(clock.sleeps).toEqual([]);
    expect(provider.requests).toHaveLength(1);
  });

  it("retries overload errors with exponential backoff up to the attempt limit", async () => {
    const provider = new ScriptedProvider([new AiError("provider_unavailable", "Overloaded.", { status: 529 })]);
    const { promise, clock, records } = run(classifier, provider);
    const result = await promise;
    expect(!result.ok && result.error.kind).toBe("provider_unavailable");
    expect(!result.ok && result.error.retryable).toBe(true);
    expect(provider.requests).toHaveLength(3);
    expect(clock.sleeps).toEqual([1_000, 2_000]);
    expect(records[0]).toMatchObject({ status: "failed", errorKind: "provider_unavailable", attempts: 3 });
  });

  it("retries timeouts and network errors", async () => {
    const provider = new ScriptedProvider([new AiError("timeout", "Slow."), new AiError("network", "Down."), valid]);
    const result = await run(classifier, provider).promise;
    expect(result.ok).toBe(true);
    expect(result.meta.attempts).toBe(3);
  });

  it.each(["authentication", "provider_rejected", "refused", "truncated", "configuration"] as const)("does not retry %s", async (kind) => {
    const provider = new ScriptedProvider([new AiError(kind, `Failure: ${kind}`), valid]);
    const result = await run(classifier, provider).promise;
    expect(!result.ok && result.error.kind).toBe(kind);
    expect(provider.requests).toHaveLength(1);
  });

  it("stops when the total time budget runs out", async () => {
    const clock = fakeClock();
    const { recorder } = memoryRecorder();
    const provider = new ScriptedProvider([
      () => {
        clock.advance(200_000);
        return new AiError("timeout", "Slow.");
      },
    ]);
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder), {
      provider,
      config: { ...TEST_CONFIG, totalTimeoutMs: 150_000 },
      now: clock.now,
      sleep: clock.sleep,
      random: () => 1,
    });
    expect(!result.ok && ["timeout", "deadline_exceeded"]).toContain(!result.ok && result.error.kind);
    expect(provider.requests).toHaveLength(1);
  });

  it("passes each prompt's settings and a bounded timeout to the provider", async () => {
    const provider = new ScriptedProvider([valid]);
    await run(classifier, provider).promise;
    expect(provider.requests[0]).toMatchObject({
      promptId: "reply_classifier",
      promptVersion: classifier.version,
      maxTokens: classifier.maxTokens,
      effort: classifier.effort,
      timeoutMs: TEST_CONFIG.timeoutMs,
    });
  });
});

describe("no silent fallback", () => {
  it("fails with a configuration error when Anthropic is selected without a key, and never uses the mock", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    const { records, recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("configuration");
    expect(result.meta).toMatchObject({ provider: "anthropic", synthetic: false });
    expect(records[0]).toMatchObject({ provider: "anthropic", status: "failed", synthetic: false, output: null });
  });

  it("reports a real provider failure as a failure, not as mock output", async () => {
    const provider = new ScriptedProvider([new AiError("authentication", "Bad key.")]);
    const result = await run(classifier, provider).promise;
    expect(result.ok).toBe(false);
    expect(result.meta.provider).toBe("anthropic");
    expect(result.meta.synthetic).toBe(false);
  });
});

describe("execution logging", () => {
  it("returns the result even if recording fails, and logs the recording failure", async () => {
    logs = captureLogs();
    const result = await runPrompt(classifier, classifier.example, aiContext(async () => {
      throw new Error("database unavailable");
    }), { provider: new MockProvider(), config: TEST_CONFIG });
    expect(result.ok).toBe(true);
    expect(result.meta.executionId).toBeNull();
    expect(logs.records.some((r) => r.level === "error" && r.message === "Could not record AI execution")).toBe(true);
  });

  it("logs outcome, duration and tokens but never the input or output text", async () => {
    logs = captureLogs();
    const secretPhrase = "Please call me on my private number";
    const input = { latestMessage: { text: `${secretPhrase}. Can we speak next week?` }, priorMessages: [] };
    await run(classifier, new ScriptedProvider([valid]), input).promise;
    const success = logs.records.find((r) => r.message === "AI execution succeeded");
    expect(success).toMatchObject({ scope: "ai", promptId: "reply_classifier", attempts: 1, inputTokens: 100, outputTokens: 50 });
    expect(typeof success?.durationMs).toBe("number");
    const all = JSON.stringify(logs.records);
    expect(all).not.toContain(secretPhrase);
    expect(all).not.toContain("The sender asks for a call");
  });

  it("records metadata only: no system prompt or input text in the execution record", async () => {
    const page = "This sentence is untrusted page content and must not be stored in the execution log.";
    const input = {
      ...PROMPTS.company_researcher.example,
      pages: [{ url: "https://acme.example/about", pageType: "about" as const, text: page }],
    };
    const { promise, records } = run(PROMPTS.company_researcher, new MockProvider(), input);
    await promise;
    const stored = JSON.stringify({ ...records[0], output: null });
    expect(stored).not.toContain(page);
    expect(stored).not.toContain("These rules take priority");
    expect(records[0].inputChars).toBeGreaterThan(page.length);
  });
});
