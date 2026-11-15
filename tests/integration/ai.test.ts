import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockProvider } from "@/server/ai/providers/mock";
import { PROMPTS } from "@/server/ai/prompts";
import { supabaseRecorder, systemAiContext } from "@/server/ai/recorder";
import { runPrompt, type AiContext } from "@/server/ai/run";
import { adminClient, anonClient, createTenant, destroyTenant, type TestTenant } from "./helpers";

/**
 * The AI runner against the real local database: executions are recorded in the
 * caller's tenant, and Row Level Security keeps each tenant's log private and append-only.
 */
const admin = adminClient();
let a: TestTenant;
let b: TestTenant;

const classifier = PROMPTS.reply_classifier;
const limits = {
  provider: "mock" as const,
  model: "hunter-mock-1",
  apiKey: null,
  timeoutMs: 10_000,
  totalTimeoutMs: 60_000,
  maxAttempts: 1,
  maxRetryDelayMs: 0,
};

function userContext(tenant: TestTenant, role: string, tenantId = tenant.tenantId): AiContext {
  const user = tenant.users[role];
  return { tenantId, actorType: "user", actorUserId: user.id, recorder: supabaseRecorder(user.client) };
}

beforeAll(async () => {
  a = await createTenant(admin, "ai-a", ["owner", "member", "viewer"]);
  b = await createTenant(admin, "ai-b", ["owner"]);
});

afterAll(async () => {
  await destroyTenant(admin, a);
  await destroyTenant(admin, b);
});

describe("AI execution log", () => {
  it("records a mock execution in the caller's tenant through their RLS-bound client", async () => {
    const result = await runPrompt(classifier, classifier.example, userContext(a, "member"), { provider: new MockProvider(), config: limits });
    expect(result.ok).toBe(true);
    expect(result.meta.executionId).toBeTruthy();

    const { data, error } = await a.users.member.client.from("ai_executions").select("*").eq("id", result.meta.executionId!).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      tenant_id: a.tenantId,
      prompt_id: "reply_classifier",
      prompt_version: classifier.version,
      provider: "mock",
      model: "hunter-mock-1",
      status: "succeeded",
      synthetic: true,
      attempts: 1,
      actor_type: "user",
      actor_user_id: a.users.member.id,
      input_tokens: null,
      error_kind: null,
    });
    expect(data!.output).toMatchObject({ intent: "wants_meeting" });
    expect(data!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("records failures with their kind and no output", async () => {
    const result = await runPrompt(classifier, { latestMessage: { text: "" }, priorMessages: [] }, userContext(a, "member"), {
      provider: new MockProvider(),
      config: limits,
    });
    expect(result.ok).toBe(false);
    const { data } = await a.users.member.client.from("ai_executions").select("status, error_kind, output, attempts").eq("id", result.meta.executionId!).single();
    expect(data).toEqual({ status: "failed", error_kind: "input_rejected", output: null, attempts: 0 });
  });

  it("cannot be read by another tenant", async () => {
    const { data } = await b.users.owner.client.from("ai_executions").select("id").eq("tenant_id", a.tenantId);
    expect(data).toEqual([]);
    const all = await b.users.owner.client.from("ai_executions").select("tenant_id");
    expect((all.data ?? []).every((row) => row.tenant_id === b.tenantId)).toBe(true);
  });

  it("refuses to record into another tenant, and the runner reports the result without a record", async () => {
    // A user of tenant A tries to log an execution against tenant B.
    const result = await runPrompt(classifier, classifier.example, userContext(a, "owner", b.tenantId), {
      provider: new MockProvider(),
      config: limits,
    });
    expect(result.ok).toBe(true);
    expect(result.meta.executionId).toBeNull();
    const { count } = await admin.from("ai_executions").select("id", { count: "exact", head: true }).eq("tenant_id", b.tenantId);
    expect(count).toBe(0);
  });

  it("stops a member recording an execution in someone else's name", async () => {
    const { error } = await a.users.member.client.from("ai_executions").insert({
      tenant_id: a.tenantId,
      prompt_id: "reply_classifier",
      prompt_version: "1.0.0",
      provider: "mock",
      status: "succeeded",
      duration_ms: 1,
      actor_user_id: a.users.owner.id,
    });
    expect(error?.code).toBe("42501");
  });

  it("keeps viewers and anonymous clients from writing, and anonymous clients from reading", async () => {
    const viewer = await runPrompt(classifier, classifier.example, userContext(a, "viewer"), { provider: new MockProvider(), config: limits });
    expect(viewer.meta.executionId).toBeNull();
    const anon = anonClient();
    expect((await anon.from("ai_executions").select("id")).data ?? []).toEqual([]);
  });

  it("is append-only: nobody can edit or delete the history", async () => {
    const result = await runPrompt(classifier, classifier.example, userContext(a, "owner"), { provider: new MockProvider(), config: limits });
    const id = result.meta.executionId!;
    const update = await a.users.owner.client.from("ai_executions").update({ status: "failed", error_kind: "unknown" }).eq("id", id).select("id");
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    const del = await a.users.owner.client.from("ai_executions").delete().eq("id", id).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await admin.from("ai_executions").select("status").eq("id", id).single();
    expect(still.data?.status).toBe("succeeded");
  });

  it("lets workflows record with the service role for a named tenant", async () => {
    const result = await runPrompt(classifier, classifier.example, systemAiContext(admin, b.tenantId, "workflow", { type: "message", id: "33333333-3333-4333-8333-333333333333" }), {
      provider: new MockProvider(),
      config: limits,
    });
    const { data } = await b.users.owner.client.from("ai_executions").select("actor_type, actor_user_id, entity_type, entity_id").eq("id", result.meta.executionId!).single();
    expect(data).toEqual({ actor_type: "workflow", actor_user_id: null, entity_type: "message", entity_id: "33333333-3333-4333-8333-333333333333" });
  });

  it("enforces the database constraints on recorded values", async () => {
    const base = { tenant_id: a.tenantId, prompt_id: "reply_classifier", prompt_version: "1.0.0", provider: "mock", duration_ms: 1 };
    expect((await admin.from("ai_executions").insert({ ...base, status: "failed" })).error?.code).toBe("23514"); // failure needs a kind
    expect((await admin.from("ai_executions").insert({ ...base, status: "succeeded", provider: "made-up" })).error?.code).toBe("23514");
    for (const provider of ["mock", "anthropic", "gemini"]) {
      expect((await admin.from("ai_executions").insert({ ...base, status: "succeeded", provider })).error, provider).toBeNull();
    }
    expect((await admin.from("ai_executions").insert({ ...base, status: "succeeded", prompt_version: "v1" })).error?.code).toBe("23514");
  });
});
