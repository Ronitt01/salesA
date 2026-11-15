import "server-only";
import type { z } from "zod";
import { logger, redactText } from "@/server/logger";
import {
  accountResponseSchema,
  domainSearchResponseSchema,
  emailFinderResponseSchema,
  emailVerifierResponseSchema,
  hunterErrorBodySchema,
  type AccountResponse,
  type DomainSearchResponse,
  type EmailFinderResponse,
  type EmailVerifierResponse,
} from "./schemas";

/**
 * Hunter.io API v2 client. Server-only.
 *
 * Hunter-specific behaviour, from the API documentation:
 * - 403 means the per-second or per-minute rate limit was hit: retried after a pause.
 * - 429 means the account's usage limit is exhausted, or (error id "restricted_account")
 *   that Hunter has restricted the account: never retried.
 * - 451 means the person asked Hunter not to process their data: never retried, and
 *   callers must not store anything about that person.
 * - Email Verifier 202 means "still verifying": polled a bounded number of times.
 * - Email Verifier 222 means the remote mail server answered unexpectedly: not retried now.
 * - Credits used are reported in the X-Credits-Used and X-Credits-Unit headers.
 *
 * The API key travels as the documented api_key query parameter. The request URL is
 * never logged or put in an error message, and the logger redacts api_key= values.
 */

export const HUNTER_BASE_URL = "https://api.hunter.io/v2";
/** Hunter's public test credential. It returns fixed dummy data and costs nothing. */
export const HUNTER_TEST_API_KEY = "test-api-key";

export type HunterEndpoint = "domain-search" | "email-finder" | "email-verifier" | "account";

export type HunterErrorKind =
  | "configuration"
  | "invalid_request"
  | "authentication"
  | "not_found"
  | "rate_limited"
  | "quota_exhausted"
  | "account_restricted"
  | "data_processing_objection"
  | "verification_pending"
  | "verification_failed"
  | "provider_unavailable"
  | "timeout"
  | "network"
  | "invalid_response"
  | "unknown";

const RETRYABLE: ReadonlySet<HunterErrorKind> = new Set(["rate_limited", "provider_unavailable", "timeout", "network"]);

export class HunterError extends Error {
  override name = "HunterError";
  readonly kind: HunterErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly endpoint: HunterEndpoint | null;

  constructor(
    kind: HunterErrorKind,
    message: string,
    options: { status?: number | null; retryAfterMs?: number | null; endpoint?: HunterEndpoint | null; cause?: unknown } = {},
  ) {
    super(redactText(message), { cause: options.cause });
    this.kind = kind;
    this.status = options.status ?? null;
    this.retryable = RETRYABLE.has(kind);
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.endpoint = options.endpoint ?? null;
  }
}

export interface HunterCredits {
  used: number | null;
  unit: string | null;
}

export interface HunterCallMeta {
  endpoint: HunterEndpoint;
  status: number;
  attempts: number;
  durationMs: number;
  credits: HunterCredits;
  retrievedAt: string;
  testKey: boolean;
}

export interface HunterResult<T> {
  data: T;
  meta: HunterCallMeta;
}

/** The operations HUNTER uses. The orchestrator depends on this, so tests can supply a fake. */
export interface HunterApi {
  readonly testKey: boolean;
  domainSearch(params: { domain: string; limit?: number; type?: "personal" | "generic" }): Promise<HunterResult<DomainSearchResponse>>;
  emailFinder(params: { domain: string; firstName: string; lastName: string }): Promise<HunterResult<EmailFinderResponse>>;
  emailVerifier(params: { email: string }): Promise<HunterResult<EmailVerifierResponse>>;
}

export interface HunterClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  verifierPollIntervalMs?: number;
  verifierMaxPolls?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export function parseRetryAfterHeader(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}

function parseCredits(headers: Headers): HunterCredits {
  const raw = headers.get("x-credits-used");
  const used = raw === null ? null : Number(raw);
  return { used: used === null || Number.isNaN(used) ? null : used, unit: headers.get("x-credits-unit") };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HunterClient implements HunterApi {
  readonly testKey: boolean;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly maxRetryDelayMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(options: HunterClientOptions) {
    if (!options.apiKey.trim()) throw new HunterError("configuration", "A Hunter API key is required.");
    this.apiKey = options.apiKey.trim();
    this.testKey = this.apiKey === HUNTER_TEST_API_KEY;
    this.baseUrl = (options.baseUrl ?? HUNTER_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 10_000;
    this.pollIntervalMs = options.verifierPollIntervalMs ?? 3_000;
    this.maxPolls = options.verifierMaxPolls ?? 3;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  domainSearch(params: { domain: string; limit?: number; type?: "personal" | "generic" }) {
    const query: Record<string, string> = { domain: params.domain, limit: String(params.limit ?? 10) };
    if (params.type) query.type = params.type;
    return this.request("domain-search", query, domainSearchResponseSchema, { domain: params.domain });
  }

  emailFinder(params: { domain: string; firstName: string; lastName: string }) {
    return this.request(
      "email-finder",
      { domain: params.domain, first_name: params.firstName, last_name: params.lastName },
      emailFinderResponseSchema,
      { domain: params.domain },
    );
  }

  emailVerifier(params: { email: string }) {
    const domain = params.email.split("@")[1] ?? null;
    return this.request("email-verifier", { email: params.email }, emailVerifierResponseSchema, { domain });
  }

  account(): Promise<HunterResult<AccountResponse>> {
    return this.request("account", {}, accountResponseSchema, {});
  }

  /**
   * One logical call: bounded retries for transient failures, bounded polling for a
   * verifier 202. Logs the endpoint, outcome, attempts, duration and credits, and the
   * business domain only. Never the URL, the key, names or email addresses.
   */
  private async request<S extends z.ZodType>(
    endpoint: HunterEndpoint,
    query: Record<string, string>,
    schema: S,
    logContext: { domain?: string | null },
  ): Promise<HunterResult<z.infer<S>>> {
    const started = this.now();
    let attempts = 0;
    let transientRetries = 0;
    let polls = 0;
    const credits: HunterCredits = { used: null, unit: null };

    const log = (level: "info" | "warn", message: string, extra: Record<string, unknown>) =>
      logger[level]("hunter", message, {
        endpoint,
        domain: logContext.domain ?? null,
        attempts,
        durationMs: Math.round(this.now() - started),
        creditsUsed: credits.used,
        creditsUnit: credits.unit,
        testKey: this.testKey,
        ...extra,
      });

    for (;;) {
      attempts += 1;
      let response: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const url = new URL(`${this.baseUrl}/${endpoint}`);
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
        url.searchParams.set("api_key", this.apiKey);
        response = await this.fetchImpl(url.toString(), { method: "GET", headers: { accept: "application/json" }, signal: controller.signal });
      } catch (error) {
        clearTimeout(timer);
        const failure = controller.signal.aborted
          ? new HunterError("timeout", `Hunter did not respond within ${this.timeoutMs} ms.`, { endpoint, cause: error })
          : new HunterError("network", `Could not reach Hunter: ${error instanceof Error ? error.message : String(error)}`, {
              endpoint,
              cause: error,
            });
        if (await this.shouldRetry(failure, transientRetries)) {
          transientRetries += 1;
          continue;
        }
        log("warn", `Hunter request failed: ${failure.kind}`, { errorKind: failure.kind });
        throw failure;
      }
      clearTimeout(timer);

      const callCredits = parseCredits(response.headers);
      if (callCredits.used !== null) credits.used = (credits.used ?? 0) + callCredits.used;
      if (callCredits.unit) credits.unit = callCredits.unit;

      if (endpoint === "email-verifier" && response.status === 202) {
        if (polls < this.maxPolls) {
          polls += 1;
          await this.sleep(this.pollIntervalMs);
          continue;
        }
        const pending = new HunterError("verification_pending", "Hunter is still verifying this address. Try again later.", { status: 202, endpoint });
        log("warn", "Hunter verification still pending", { status: 202, errorKind: pending.kind });
        throw pending;
      }

      if (!response.ok || response.status === 222) {
        const failure = await this.classifyHttpError(endpoint, response);
        if (await this.shouldRetry(failure, transientRetries)) {
          transientRetries += 1;
          continue;
        }
        log("warn", `Hunter request failed: ${failure.kind}`, { status: response.status, errorKind: failure.kind });
        throw failure;
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new HunterError("invalid_response", "Hunter returned a response that is not JSON.", { status: response.status, endpoint, cause: error });
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        const failure = new HunterError("invalid_response", `Hunter's ${endpoint} response did not match the expected structure (${issues}).`, {
          status: response.status,
          endpoint,
        });
        log("warn", "Hunter response failed validation", { status: response.status, errorKind: failure.kind });
        throw failure;
      }

      const meta: HunterCallMeta = {
        endpoint,
        status: response.status,
        attempts,
        durationMs: Math.round(this.now() - started),
        credits,
        retrievedAt: new Date(this.now()).toISOString(),
        testKey: this.testKey,
      };
      log("info", "Hunter request succeeded", { status: response.status });
      return { data: parsed.data, meta };
    }
  }

  private async shouldRetry(error: HunterError, retriesSoFar: number): Promise<boolean> {
    if (!error.retryable || retriesSoFar >= this.maxAttempts - 1) return false;
    const backoff = Math.min(this.maxRetryDelayMs, 1_000 * 2 ** retriesSoFar) * (0.5 + this.random() * 0.5);
    const delay = Math.round(error.retryAfterMs ?? backoff);
    if (delay > this.maxRetryDelayMs) return false;
    await this.sleep(delay);
    return true;
  }

  private async classifyHttpError(endpoint: HunterEndpoint, response: Response): Promise<HunterError> {
    const status = response.status;
    let detail = "";
    let errorIds: string[] = [];
    try {
      const parsed = hunterErrorBodySchema.safeParse(await response.json());
      if (parsed.success) {
        detail = parsed.data.errors.map((e) => [e.id, e.details].filter(Boolean).join(": ")).join("; ");
        errorIds = parsed.data.errors.flatMap((e) => (e.id ? [e.id] : []));
      }
    } catch {
      // Body was not JSON.
    }
    const suffix = detail ? ` (${detail.slice(0, 300)})` : "";
    const common = { status, endpoint };
    const retryAfterMs = parseRetryAfterHeader(response.headers.get("retry-after"), this.now());

    switch (status) {
      case 222:
        return new HunterError("verification_failed", `The recipient's mail server gave an unexpected answer. Try again later${suffix}.`, common);
      case 400:
      case 422:
        return new HunterError("invalid_request", `Hunter rejected the request${suffix}.`, common);
      case 401:
        return new HunterError("authentication", "Hunter rejected the API key.", common);
      case 403:
        return new HunterError("rate_limited", `Hunter's request rate limit was reached${suffix}.`, { ...common, retryAfterMs });
      case 404:
        return new HunterError("not_found", `Hunter has no result for this request${suffix}.`, common);
      case 429:
        if (errorIds.includes("restricted_account")) {
          return new HunterError("account_restricted", `Hunter has restricted this account. Log in to Hunter to resolve it${suffix}.`, common);
        }
        return new HunterError("quota_exhausted", `The Hunter account's usage limit is exhausted. No retry was attempted${suffix}.`, common);
      case 451:
        return new HunterError("data_processing_objection", "This person asked Hunter not to process their personal data. Nothing will be stored.", common);
      default:
        if (status >= 500) return new HunterError("provider_unavailable", `Hunter is temporarily unavailable (HTTP ${status}).`, { ...common, retryAfterMs });
        return new HunterError("unknown", `Unexpected Hunter response (HTTP ${status})${suffix}.`, common);
    }
  }
}

export interface HunterSettings {
  apiKey: string;
  testKey: boolean;
}

/** Reads HUNTER_API_KEY. A missing key is a configuration error. */
export function loadHunterSettings(env: Record<string, string | undefined> = process.env): HunterSettings {
  const apiKey = env.HUNTER_API_KEY?.trim();
  if (!apiKey) throw new HunterError("configuration", "HUNTER_API_KEY is not set, so contact enrichment is unavailable.");
  return { apiKey, testKey: apiKey === HUNTER_TEST_API_KEY };
}

export function isHunterConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.HUNTER_API_KEY?.trim());
}

/** Whether a key is set, and whether it is Hunter's test key. Never returns the key. */
export function hunterKeyStatus(env: Record<string, string | undefined> = process.env): "missing" | "test" | "live" {
  const key = env.HUNTER_API_KEY?.trim();
  if (!key) return "missing";
  return key === HUNTER_TEST_API_KEY ? "test" : "live";
}
