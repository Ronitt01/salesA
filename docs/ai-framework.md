# AI framework

The shared foundation every HUNTER AI feature runs on. It is built and tested. **No agent is wired into a workflow or screen yet**; the six prompts exist so that the next modules can use them.

Code: `src/server/ai/`. Everything in it is server-only.

## Using it

```ts
import { PROMPTS, runPrompt, sessionAiContext } from "@/server/ai";

const ctx = await requireWriter();                       // from a server action
const result = await runPrompt(PROMPTS.reply_classifier, input, sessionAiContext(ctx));

if (!result.ok) {
  // result.error.kind tells you why: configuration, input_rejected, rate_limited, ...
  return { ok: false, error: result.error.message };
}
result.data;           // typed and validated output
result.meta.synthetic; // true when the mock produced it: never treat it as research
```

Scheduled or webhook work without a user session uses `systemAiContext(admin, tenantId)`, which records with the service-role client against an explicit tenant.

`runPrompt` never throws for expected failures. It returns `{ ok: false }` with a kind, and records every call, successful or not.

## What happens on a call

1. **Tenant check.** The context must name a valid tenant.
2. **Input validation.** The prompt's strict Zod input schema. Failure stops here with `input_rejected`; nothing is sent. Over-long text is rejected, never silently truncated.
3. **Provider selection** from the environment. A misconfiguration fails with `configuration`. **There is no fallback to the mock.**
4. **Request building.** The system prompt is the shared security preamble plus the prompt's own instructions. Untrusted text goes only into the user turn, inside `<untrusted_document>` blocks.
5. **Injection scan.** Common injection phrasing in untrusted input is recorded and logged as `injection_signals`. It does not block the call.
6. **Model call** with a per-attempt timeout bounded by the remaining total budget.
7. **Parse** the response as JSON.
8. **Validate** against the prompt's strict output schema. Unknown fields are rejected.
9. **Guards** check the output against the input (see below).
10. **Record** the execution in `ai_executions` and write one structured log line.

## Reliability

| Situation | Behaviour |
|---|---|
| Timeout, network error, 5xx, 529 overloaded | Retried with exponential backoff (1s, 2s, ...) and jitter, up to `LLM_MAX_ATTEMPTS` total attempts |
| 429 rate limit | Waits for the provider's `retry-after`. If that exceeds `LLM_MAX_RETRY_DELAY_MS`, the call fails at once instead of waiting |
| Invalid JSON, schema failure, guard failure | Asked once more, then fails |
| 400, 401, 403, 404, 413, refusal, truncation | Not retried |
| Total time budget (`LLM_TOTAL_TIMEOUT_MS`) used up | Fails with `deadline_exceeded` |
| Recording the execution fails | The result is still returned; the failure is logged at error level |

The Anthropic SDK's own retries are switched off so that every attempt is counted and bounded in one place.

### Error kinds

`configuration`, `input_rejected`, `timeout`, `network`, `rate_limited`, `provider_unavailable`, `provider_rejected`, `authentication`, `refused`, `truncated`, `invalid_json`, `schema_validation`, `guard_failed`, `deadline_exceeded`, `unknown`.

## Providers

| Provider | Selected by | Notes |
|---|---|---|
| Mock | `LLM_PROVIDER=mock` or unset | Deterministic fixtures, no credentials, no usage figures. Every result is recorded as `synthetic` |
| Anthropic | `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | Official `@anthropic-ai/sdk`. Default model `claude-opus-5-5`, override with `ANTHROPIC_MODEL` |
| Gemini | `LLM_PROVIDER=gemini` + `GEMINI_API_KEY` | Official `@google/genai`. Default model `gemini-3.8-flash`, override with `GEMINI_MODEL` |
| OpenAI | reserved | Selecting it returns a configuration error |

Switching provider needs only environment changes; no code, prompt or schema differs between providers. Each provider reads only its own key: an Anthropic key never makes Gemini work, or the reverse. Every execution records the provider and the model that actually served it.

**Anthropic request details.** These come from the current API reference and the installed SDK 1.8.0:

- Structured output through `output_config.format`, built from the prompt's Zod schema. HUNTER still parses and validates the text itself.
- `output_config.effort` is set per prompt. The reply classifier uses `low`; the others use `medium`.
- Thinking is left at the model default (adaptive). No sampling parameters are sent, because current models reject them.
- **Server-side refusal fallback is on.** The request carries `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta. If Claude Opus 5.5 declines on safety grounds, Anthropic re-runs the request on its recommended fallback model inside the same call. The model that actually answered is recorded in `ai_executions.model`. A refusal by the whole chain returns `refused`. To turn this off, remove those two fields in `providers/anthropic.ts`.
- The SDK authenticates with `Authorization: Bearer <ANTHROPIC_API_KEY>`. Because the key is passed explicitly, no ambient credential (environment token or `ant` profile) is used.

**Gemini request details.** These come from the installed `@google/genai` 3.3.0 type definitions and runtime. The request shape was captured from the SDK in a test:

- Gemini Developer API (`generativelanguage.googleapis.com`, `models/{model}:generateContent`). The key is sent in the `x-goog-api-key` header, never in the URL.
- **Vertex AI mode is switched off explicitly** (`vertexai: false`) and the key is passed explicitly. Environment variables such as `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_API_KEY` or ambient Google Cloud credentials cannot change where requests go or which key is used.
- **SDK retries are disabled** (`retryOptions.attempts: 1`). The SDK otherwise retries up to 5 times by itself; HUNTER's runner owns retries.
- **The timeout is HUNTER's own abort timer.** This lets a timeout be reported as `timeout` (retryable) and a cancellation as `deadline_exceeded`.
- **Structured output** uses `responseMimeType: "application/json"` and `responseJsonSchema`, built from the prompt's Zod schema. Gemini accepts only a subset of JSON Schema, so keywords outside its documented list (`minLength`, `maxLength`, `pattern`, `$schema` and so on) are removed from the copy sent to the API. **The full Zod schema still validates every response**, and provider JSON is never trusted as valid.
- **Effort maps to the thinking level:** `low`, `medium` and `high` become `LOW`, `MEDIUM` and `HIGH`. Thoughts are not requested. Thought parts are excluded from the response text.
- **Usage:** input = `promptTokenCount`; output = `candidatesTokenCount` + `thoughtsTokenCount` (thinking is billed as output); cache read = `cachedContentTokenCount`. The served model comes from `modelVersion`, and the request id from `responseId`.
- **Error mapping:**
  - `429` becomes `rate_limited`, waiting for Gemini's `RetryInfo.retryDelay`.
  - `5xx` becomes `provider_unavailable`.
  - `401`, `403` and "API key not valid" become `authentication`.
  - Other `4xx` become `provider_rejected`.
  - A failed `fetch` becomes `network`.
- **Finish reasons:**
  - A prompt block, `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT` and `SPII` become `refused`.
  - `MAX_TOKENS` becomes `truncated`.
  - Any other non-`STOP` reason becomes `provider_rejected`.
- There is no server-side refusal fallback for Gemini; a refusal is returned as `refused`.
- `thinkingLevel` is the thinking control the SDK documents for current Gemini models. If you point `GEMINI_MODEL` at an older model that does not accept it, calls fail with `provider_rejected`. They are never silently re-routed.

### The mock is honest

- It returns each prompt's predefined fixture, which then goes through the same parsing, schema checks and guards as real output.
- It never claims to have browsed, searched or contacted anyone. A test checks this.
- Every text field says "Synthetic mock".
- The company researcher mock quotes the first sentence of a supplied page, so its evidence passes the real guard without inventing anything.
- The reply classifier mock uses keyword rules.

## Security

| Threat | Defence |
|---|---|
| API key exposure | `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` are read only in `config.ts`. Every module that reads keys or calls providers imports `server-only`. Keys (including Google `AIza...` keys) are redacted from errors and logs and never stored. A test checks that no client component imports the AI layer or either SDK. `npm run check:bundle` scans the browser bundle |
| Instructions hidden in websites or emails | The system prompt carries the rules and untrusted text sits only in the user turn. Untrusted blocks are delimited, and any text that could close or forge a block is removed. Invisible and bidirectional characters are stripped. The preamble tells the model that block content is data |
| Model obeys an injection anyway | **Guards** reject the output (below). **Strict schemas** reject any field the prompt does not define, so a model cannot add a score, a qualification or a "send" instruction. No tools are given to the model, so its output can never act directly |
| Fabricated evidence | Each cited URL must be one of the supplied pages, and each quote must appear on that page word for word (ignoring case, spacing and quote style) |
| Fabricated references | Fact ids and service slugs must come from the input |
| Commercial promises | Money amounts, percentages, guarantees, ROI, savings claims, delivery timeframes and discounts are rejected in strategy and message output |
| Missed opt-out | The message generator must include HUNTER's opt-out line verbatim. `detectOptOutLanguage()` is a deterministic check that reply processing must apply whatever the model says |
| Cross-tenant leakage | Every execution belongs to one tenant. RLS on `ai_executions` restricts reads to members and writes to members recording as themselves. The table is append-only. Providers keep no state between calls |
| Bypassing the compliance gate | The AI layer cannot send anything. A generated draft is stored for approval and every send still passes the gate |

**Limit of the injection scan.** It is a heuristic for visibility. The guards and strict schemas are what actually contain an injection.

## Prompts

One file per prompt in `src/server/ai/prompts/`. Each file defines:

- id, version and changelog
- strict input and output schemas
- instructions, user-turn rendering, guards and mock fixture
- a synthetic example input

| Id | Purpose | Notes |
|---|---|---|
| `company_researcher` | Observed facts with word-for-word evidence, plus separate hypotheses | Evidence guard |
| `buying_signal_detector` | Dated, quoted buying signals | Evidence guard |
| `lead_qualifier` | Classifies evidence (team size, contact role, problems, disqualifiers) | **Produces no score.** Scores come only from the scoring engine |
| `opportunity_strategist` | One catalogue service as a hypothesis, with validation questions | Promise guard; slug and fact ids checked |
| `sales_message_generator` | One email draft citing stored facts | Opt-out, placeholder and promise guards |
| `reply_classifier` | One of ten intents, with opt-out and human-review flags | Consistency guard |

### Versioning

- Each prompt has a semantic `version`, recorded on every execution.
- `src/server/ai/prompts/prompt-lock.json` maps `id@version` to a fingerprint. The fingerprint covers the full system prompt, the user turn rendered from the example input, both schemas and the model settings.
- A unit test fails if a prompt changes without a version bump.

To change a prompt:

1. Edit the file, bump `version`, and add a changelog line.
2. Run `npm run ai:lock`. The lock is append-only: it adds the new entry and refuses to overwrite an existing one.
3. Commit the prompt and the lock together.

Changing the shared preamble or the untrusted-content wrapper changes every prompt, so every version must be bumped.

## Execution log: `ai_executions`

One row per call. It records:

- tenant
- prompt id and version
- provider, and the model that served the call
- status and error kind
- attempts and duration
- input and output tokens, and cache tokens (null when not reported)
- input size in characters
- injection signals
- synthetic flag
- actor and related entity
- provider request id
- validated output on success, or a redacted excerpt of unusable output on failure

It **never stores the prompt or the input text.** Logs follow the same rule: identifiers, counts and outcomes only.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `mock`, `anthropic` or `gemini` |
| `ANTHROPIC_API_KEY` | (none) | Required for `anthropic`. Server only |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model id |
| `GEMINI_API_KEY` | (none) | Required for `gemini`. Server only |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model id |
| `LLM_TIMEOUT_MS` | 120000 | Per attempt |
| `LLM_TOTAL_TIMEOUT_MS` | 300000 | Whole call, retries included |
| `LLM_MAX_ATTEMPTS` | 3 | Attempts for transient failures (1–5) |
| `LLM_MAX_RETRY_DELAY_MS` | 30000 | Longest wait HUNTER will accept |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |

## Checking a live provider

```bash
# Anthropic: in .env.local set LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY=...
npm run ai:smoke                         # reply_classifier on its synthetic example
npm run ai:smoke -- company_researcher   # another prompt

# Gemini: put GEMINI_API_KEY=... in .env.local, then either set LLM_PROVIDER=gemini or run
npm run ai:smoke:gemini                  # forces Gemini for this one run
npm run ai:smoke -- company_researcher --provider=gemini
```

This makes one real, billed call with the prompt's fictional example input, and records it against the local demo workspace. The script refuses to run against a non-local database. `--provider` changes only that run, and a missing key for the chosen provider is an error.

## Adding a prompt or a provider

- **Prompt.**
  1. Copy an existing file and give it a new id.
  2. Keep the output schema strict, and write a guard for anything that can be checked against the input.
  3. Make the mock fixture honest about being synthetic.
  4. Register the prompt in `prompts/index.ts`, then run `npm run ai:lock`.
- **Provider.**
  1. Implement `LlmProvider` in `providers/`, mapping every failure to an `AiError` kind.
  2. Do not retry inside the adapter.
  3. Add a case in `config.ts`, and write tests against a fake transport.
