import "server-only";
import { logger, redactText } from "@/server/logger";
import { createProvider, loadAiConfig, requestedProviderName, type AiConfig } from "./config";
import { AiError, isRepairable, toAiError, type AiErrorKind } from "./errors";
import { extractJson } from "./json";
import { buildSystemPrompt, type PromptDefinition } from "./prompts/shared";
import type { LlmProvider, LlmUsage } from "./types";
import { detectInjection } from "./untrusted";

export type RecordedProvider = "mock" | "anthropic" | "openai" | "unconfigured";

/** What the runner stores about each call. Never contains the prompt or the input text. */
export interface AiExecutionRecord {
  tenantId: string;
  promptId: string;
  promptVersion: string;
  provider: RecordedProvider;
  model: string | null;
  status: "succeeded" | "failed";
  errorKind: AiErrorKind | null;
  errorMessage: string | null;
  attempts: number;
  durationMs: number;
  usage: LlmUsage | null;
  inputChars: number;
  injectionSignals: string[];
  synthetic: boolean;
  entityType: string | null;
  entityId: string | null;
  actorType: "user" | "system" | "workflow";
  actorUserId: string | null;
  providerRequestId: string | null;
  output: unknown;
  rawExcerpt: string | null;
}

/** Persists one execution record and returns its id. */
export type ExecutionRecorder = (record: AiExecutionRecord) => Promise<string>;

export interface AiContext {
  /** Every execution belongs to exactly one tenant. */
  tenantId: string;
  actorType: "user" | "system" | "workflow";
  actorUserId: string | null;
  recorder: ExecutionRecorder;
  /** What the call is about, for traceability. */
  entity?: { type: string; id: string };
}

export interface RunOptions {
  /** Overrides provider selection. Used by tests and by callers that hold a provider. */
  provider?: LlmProvider;
  config?: AiConfig;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  signal?: AbortSignal;
}

export interface AiRunMeta {
  executionId: string | null;
  promptId: string;
  promptVersion: string;
  provider: RecordedProvider;
  model: string | null;
  /** True when the output came from the mock provider. */
  synthetic: boolean;
  attempts: number;
  durationMs: number;
  usage: LlmUsage | null;
  injectionSignals: string[];
}

export type AiResult<T> =
  | { ok: true; data: T; meta: AiRunMeta }
  | { ok: false; error: { kind: AiErrorKind; message: string; retryable: boolean; details: string[] }; meta: AiRunMeta };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE_BACKOFF_MS = 1_000;
const MAX_REPAIR_ATTEMPTS = 1;
const EXCERPT_LENGTH = 1_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function addUsage(total: LlmUsage | null, next: LlmUsage | null): LlmUsage | null {
  if (!next) return total;
  if (!total) return { ...next };
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadInputTokens: total.cacheReadInputTokens + next.cacheReadInputTokens,
    cacheCreationInputTokens: total.cacheCreationInputTokens + next.cacheCreationInputTokens,
  };
}

/** Describes Zod issues by path and message only, never by value. */
function describeIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, limit = 5): string[] {
  return issues.slice(0, limit).map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`);
}

/**
 * Runs one versioned prompt and returns a validated result.
 *
 * It never throws for expected failures: configuration, invalid input, provider
 * errors and invalid output all come back as `{ ok: false }` with a kind. Every call,
 * including failures, is recorded against the tenant in the context.
 */
export async function runPrompt<I, O>(
  prompt: PromptDefinition<I, O>,
  rawInput: unknown,
  context: AiContext,
  options: RunOptions = {},
): Promise<AiResult<O>> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const startedAt = now();

  let provider: LlmProvider | null = options.provider ?? null;
  let recordedProvider: RecordedProvider = provider?.name ?? requestedProviderName();
  let attempts = 0;
  let usage: LlmUsage | null = null;
  let injectionSignals: string[] = [];
  let inputChars = 0;
  let servedModel: string | null = provider?.model ?? null;
  let providerRequestId: string | null = null;

  const meta = (executionId: string | null): AiRunMeta => ({
    executionId,
    promptId: prompt.id,
    promptVersion: prompt.version,
    provider: recordedProvider,
    model: servedModel,
    synthetic: provider?.synthetic ?? false,
    attempts,
    durationMs: Math.max(0, Math.round(now() - startedAt)),
    usage,
    injectionSignals,
  });

  const record = async (
    status: "succeeded" | "failed",
    fields: { error?: AiError; output?: O; rawText?: string | null },
  ): Promise<AiRunMeta> => {
    const base = meta(null);
    const entry: AiExecutionRecord = {
      tenantId: context.tenantId,
      promptId: prompt.id,
      promptVersion: prompt.version,
      provider: base.provider,
      model: base.model,
      status,
      errorKind: fields.error?.kind ?? null,
      errorMessage: fields.error ? fields.error.message.slice(0, 1_000) : null,
      attempts,
      durationMs: base.durationMs,
      usage,
      inputChars,
      injectionSignals,
      synthetic: base.synthetic,
      entityType: context.entity?.type ?? null,
      entityId: context.entity?.id ?? null,
      actorType: context.actorType,
      actorUserId: context.actorUserId,
      providerRequestId,
      output: status === "succeeded" ? (fields.output ?? null) : null,
      rawExcerpt: fields.rawText ? redactText(fields.rawText).slice(0, EXCERPT_LENGTH) : null,
    };

    let executionId: string | null = null;
    try {
      executionId = await context.recorder(entry);
    } catch (error) {
      logger.error("ai", "Could not record AI execution", {
        promptId: prompt.id,
        tenantId: context.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const logFields = {
      executionId,
      tenantId: context.tenantId,
      promptId: prompt.id,
      promptVersion: prompt.version,
      provider: base.provider,
      model: base.model,
      synthetic: base.synthetic,
      attempts,
      durationMs: base.durationMs,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      injectionSignals,
      errorKind: fields.error?.kind ?? null,
      providerRequestId,
    };
    if (status === "succeeded") logger.info("ai", "AI execution succeeded", logFields);
    else logger.warn("ai", `AI execution failed: ${fields.error?.message ?? "unknown error"}`, logFields);
    return { ...base, executionId };
  };

  const fail = async (error: AiError, rawText: string | null = null): Promise<AiResult<O>> => {
    const m = await record("failed", { error, rawText });
    return {
      ok: false,
      error: { kind: error.kind, message: error.message, retryable: error.retryable, details: error.details },
      meta: m,
    };
  };

  if (!UUID.test(context.tenantId)) {
    return fail(new AiError("input_rejected", "The AI context has no valid tenant."));
  }

  // 1. Validate input before anything leaves the server.
  const parsedInput = prompt.inputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    return fail(
      new AiError("input_rejected", `The input for ${prompt.id} failed validation.`, {
        details: describeIssues(parsedInput.error.issues),
      }),
    );
  }
  const input = parsedInput.data;

  // 2. Select the provider. A configuration problem is a failure, never a switch to the mock.
  let config: AiConfig | null = options.config ?? null;
  if (!provider) {
    try {
      config = config ?? loadAiConfig();
      provider = createProvider(config);
      recordedProvider = provider.name;
      servedModel = provider.model;
    } catch (error) {
      return fail(toAiError(error));
    }
  }
  const limits = config ?? loadLimitsSafely();

  // 3. Build the request. Untrusted text only ever reaches the user turn.
  const system = buildSystemPrompt(prompt);
  const user = prompt.buildUser(input);
  inputChars = system.length + user.length;
  injectionSignals = detectInjection(prompt.untrustedText(input));
  if (injectionSignals.length > 0) {
    logger.warn("ai", "Possible prompt injection in untrusted input", {
      promptId: prompt.id,
      tenantId: context.tenantId,
      injectionSignals,
    });
  }
  const fixture = () => prompt.mockFixture(input);
  const deadline = startedAt + limits.totalTimeoutMs;

  let transientRetries = 0;
  let repairs = 0;
  let lastRawText: string | null = null;

  // 4. Call, validate, and retry within bounds.
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) return fail(new AiError("deadline_exceeded", "The AI call ran out of time before it succeeded."), lastRawText);
    if (options.signal?.aborted) return fail(new AiError("deadline_exceeded", "The AI call was cancelled."), lastRawText);

    attempts += 1;
    try {
      const response = await provider.generate({
        promptId: prompt.id,
        promptVersion: prompt.version,
        system,
        user,
        outputSchema: prompt.outputSchema,
        maxTokens: prompt.maxTokens,
        effort: prompt.effort,
        timeoutMs: Math.max(1, Math.min(prompt.timeoutMs ?? limits.timeoutMs, remaining)),
        signal: options.signal,
        fixture,
      });
      usage = addUsage(usage, response.usage);
      servedModel = response.model;
      providerRequestId = response.providerRequestId;
      lastRawText = response.text;

      const json = extractJson(response.text);
      const validated = prompt.outputSchema.safeParse(json);
      if (!validated.success) {
        throw new AiError("schema_validation", "The model response did not match the expected structure.", {
          details: describeIssues(validated.error.issues),
          rawText: response.text,
        });
      }
      const problems = prompt.guard(validated.data, input);
      if (problems.length > 0) {
        throw new AiError("guard_failed", "The model response broke an output rule.", { details: problems, rawText: response.text });
      }

      const m = await record("succeeded", { output: validated.data });
      return { ok: true, data: validated.data, meta: m };
    } catch (caught) {
      const error = toAiError(caught);
      usage = addUsage(usage, error.usage);
      if (error.providerRequestId) providerRequestId = error.providerRequestId;
      if (error.rawText) lastRawText = error.rawText;

      if (error.retryable && transientRetries < limits.maxAttempts - 1) {
        const backoff = Math.min(limits.maxRetryDelayMs, BASE_BACKOFF_MS * 2 ** transientRetries) * (0.5 + random() * 0.5);
        const delay = Math.round(error.retryAfterMs ?? backoff);
        if (delay > limits.maxRetryDelayMs) {
          return fail(
            new AiError(error.kind, `${error.message} The provider asked to wait ${Math.ceil(delay / 1000)}s, which exceeds the retry limit.`, {
              status: error.status,
            }),
            lastRawText,
          );
        }
        if (now() + delay >= deadline) return fail(error, lastRawText);
        transientRetries += 1;
        logger.info("ai", "Retrying after a transient provider error", {
          promptId: prompt.id,
          errorKind: error.kind,
          attempt: attempts,
          delayMs: delay,
        });
        await sleep(delay);
        continue;
      }
      if (isRepairable(error.kind) && repairs < MAX_REPAIR_ATTEMPTS) {
        repairs += 1;
        logger.info("ai", "Retrying once after an unusable response", { promptId: prompt.id, errorKind: error.kind, attempt: attempts });
        continue;
      }
      return fail(error, lastRawText);
    }
  }
}

/** Limits for a caller that injected a provider but no config. */
function loadLimitsSafely(): Pick<AiConfig, "timeoutMs" | "totalTimeoutMs" | "maxAttempts" | "maxRetryDelayMs"> {
  try {
    return loadAiConfig({ ...process.env, LLM_PROVIDER: "mock" });
  } catch {
    return { timeoutMs: 120_000, totalTimeoutMs: 300_000, maxAttempts: 3, maxRetryDelayMs: 30_000 };
  }
}
