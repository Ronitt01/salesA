import type { AiConfig } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import type { AiContext, AiExecutionRecord } from "@/server/ai/run";
import type { LlmProvider, LlmRequest, LlmResponse } from "@/server/ai/types";
import { setLogSink, type LogRecord } from "@/server/logger";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const USER = "22222222-2222-4222-8222-222222222222";

export type Step = string | AiError | ((request: LlmRequest) => string | AiError);

/** A provider that replays a fixed script of responses and errors. */
export class ScriptedProvider implements LlmProvider {
  readonly model = "scripted-model";
  readonly synthetic = false;
  readonly requests: LlmRequest[] = [];

  constructor(
    private readonly steps: Step[],
    readonly name: "anthropic" | "mock" = "anthropic",
  ) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const step = this.steps[Math.min(this.requests.length - 1, this.steps.length - 1)];
    const value = typeof step === "function" ? step(request) : step;
    if (value instanceof AiError) throw value;
    return {
      text: value,
      model: this.model,
      stopReason: "end_turn",
      usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      providerRequestId: `req_${this.requests.length}`,
    };
  }
}

export function memoryRecorder() {
  const records: AiExecutionRecord[] = [];
  return {
    records,
    recorder: async (record: AiExecutionRecord) => {
      records.push(record);
      return `exec-${records.length}`;
    },
  };
}

export function aiContext(recorder: AiContext["recorder"]): AiContext {
  return { tenantId: TENANT, actorType: "user", actorUserId: USER, recorder };
}

/** A clock that only moves when the runner sleeps. */
export function fakeClock(start = 1_000_000) {
  let time = start;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

export const TEST_CONFIG: AiConfig = {
  provider: "anthropic",
  model: "scripted-model",
  apiKey: "test-key-not-real",
  timeoutMs: 10_000,
  totalTimeoutMs: 120_000,
  maxAttempts: 3,
  maxRetryDelayMs: 30_000,
};

export function captureLogs() {
  const records: LogRecord[] = [];
  setLogSink((record) => records.push(record));
  return { records, stop: () => setLogSink(null) };
}
