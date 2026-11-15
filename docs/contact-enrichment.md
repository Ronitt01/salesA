# Contact enrichment (Hunter.io)

HUNTER uses [Hunter.io](https://hunter.io/api-documentation/v2) to find decision-makers at a researched company and to verify their email addresses. It only discovers and verifies. **Nothing in this integration sends a message or contacts anyone.** A discovered person reaches outreach only through the existing campaign, approval queue and compliance gate.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `HUNTER_API_KEY` | empty | Server only. Empty disables enrichment and verification; the buttons say so |
| `HUNTER_MIN_SCORE` | 50 | Minimum opportunity score, unless the company is already qualified or later |
| `HUNTER_ENRICH_COOLDOWN_DAYS` | 30 | Days before a company can be enriched again (a person can force it) |
| `HUNTER_VERIFY_COOLDOWN_DAYS` | 30 | Days before Hunter re-checks an address it already verified |
| `HUNTER_MAX_NEW_CONTACTS` | 5 | New contacts created per run |
| `HUNTER_MAX_VERIFICATIONS_PER_RUN` | 5 | Verifier calls per run |
| `HUNTER_MAX_FINDER_CALLS_PER_RUN` | 3 | Email Finder calls per run |
| `HUNTER_DOMAIN_SEARCH_LIMIT` | 10 | People requested from Domain Search |

`test-api-key` is Hunter's free test key. It returns the same fictional company for any domain, so the app refuses it for real records. The smoke command accepts it.

The key is read only in `src/server/providers/hunter/client.ts` (a unit test enforces this). Hunter takes the key as an `api_key` query parameter, so the logger redacts `api_key=`, `key=` and `token=` values from any string. The key never appears in logs, audit rows, source metadata or smoke output. `npm run check:bundle` fails if it reaches a browser file.

## Code map

| File | Role |
|---|---|
| `src/server/providers/hunter/client.ts` | HTTP client: Domain Search, Email Finder, Email Verifier, Account. Timeouts, retries, error kinds, credit headers |
| `src/server/providers/hunter/schemas.ts` | Zod schemas for Hunter's responses |
| `src/server/services/enrichment/ranking.ts` | Deterministic decision-maker ranking |
| `src/server/services/enrichment/policy.ts` | Who may be enriched, cooldowns, per-run limits |
| `src/server/services/enrichment/merge.ts` | Pure rules: matching, deduplication, what may overwrite what, provenance |
| `src/server/services/enrichment/verification.ts` | Hunter status → HUNTER status |
| `src/server/services/enrichment/enrich.ts` | The two operations: `enrichCompanyContacts`, `verifyContactEmail` |
| `src/server/actions/enrichment.ts` | Server actions behind the buttons (writer role required) |
| `src/server/repositories/enrichment.ts` | Why a button is disabled, computed without calling Hunter |
| `src/components/leads/enrichment-controls.tsx` | Enrich contacts and Verify email buttons |

## The client

- **Timeout** 30 s per request, through its own abort controller.
- **Retries** only for transient failures (Hunter's 403 rate limit, 5xx, timeout, network): at most 3 attempts, exponential backoff from 1 s with jitter, capped at 10 s, and `Retry-After` honoured within the cap.
- **Verifier 202** (check still running) is polled up to 3 times, 3 s apart. **222** (unexpected SMTP answer) is a failure, not a result.
- **Never retried:** 400, 401, 404, 422, 429 (usage limit or restricted account) and 451.
- **451** means the person asked Hunter not to process their data. HUNTER stores nothing about them.
- **Credits** come from Hunter's `X-Credits-Used` and `X-Credits-Unit` headers, are added up per run, and are stored on the source row and in the audit entry.
- **Logs** record endpoint, domain, status, attempts, duration and credits. They never record names, email addresses or the key.

Error kinds: `configuration`, `invalid_request`, `authentication`, `not_found`, `rate_limited`, `quota_exhausted`, `account_restricted`, `data_processing_objection`, `verification_pending`, `verification_failed`, `provider_unavailable`, `timeout`, `network`, `invalid_response`, `unknown`.

## Enriching a company

1. **Eligibility.** Refused, before any call, when the key is the test key, or the company:
   - is demo data, or its domain is reserved (`.example`, `.test`, `.invalid`, `.localhost`, `.local`)
   - is rejected, or still discovered and not researched
   - scores below `HUNTER_MIN_SCORE` and is not yet qualified
   - was enriched within the cooldown, unless forced
2. **Domain Search** for personal addresses. If it fails, the run ends with no writes except a `contacts.enrichment_failed` audit entry. If Hunter answers for a different domain, nothing is stored.
3. **Ranking.** People are ranked by role priority (founder 100, owner 95, CEO 92, managing director 90, operations head 80, sales head 75, CTO 72, IT head 70), then seniority, department and Hunter's decision-maker flag. Ties go to the higher confidence, then the email address, so the order is always the same. People below the minimum relevance (30) are skipped. The weights are in `DEFAULT_RANKING` and can be passed per call.
4. **Matching.** Each person is matched to an existing contact by email, then by name. Skipped:
   - generic mailboxes (info@, sales@ …)
   - addresses on another domain, suppressed addresses or domains, and addresses held by a contact at another company
   - people without a name, and anyone beyond `HUNTER_MAX_NEW_CONTACTS`
5. **Email Finder**, only for existing contacts who have a name but no email address.
6. **Verification** of the top new and changed addresses, up to the per-run limit. If Hunter reports the usage limit, a restricted account or a key problem, no further calls are made in that run.
7. **Writes**, only after every call has finished:
   - one `sources` row (kind `search_provider`, provider `hunter.io`) with calls and credits
   - new contacts; only the first is made primary, and only if the company has none
   - updates, after re-reading each contact so a concurrent manual edit wins
   - a `contact_verifications` row per check
   - a `research` activity and a `contacts.enriched` audit entry
8. **Rescoring** through `rescoreCompany` when anything changed. The scoring formula is unchanged.

## What may overwrite what

| Field | Rule |
|---|---|
| Email | Filled when empty. A manually entered address, or one with no provenance (treated as manual), is never replaced. A manually verified address is never replaced. A Hunter address is replaced only by one with strictly higher confidence, or when the current one is invalid |
| Name | Never changed on an existing contact |
| Job title | Filled when empty. A title Hunter supplied earlier is refreshed if Hunter's changes; a manual title is kept |
| Verification status | Never changed when `verification_provider` is `manual`. Hunter's result is still added to the history |

Hunter's statuses map like this. Only `valid` counts as a deliverable address.

| Hunter | Stored as |
|---|---|
| `valid` | `valid` |
| `accept_all` | `catch_all` |
| `webmail` | `risky` |
| `disposable`, `invalid` | `invalid` |
| `unknown` or anything else | `unknown` |

Hunter's exact status, score and individual checks are kept in `contact_verifications.detail` (`hunter_status`, `score`, `checks`, `sources_found`, `credits`) and shown on the lead page.

## Provenance

`contacts.field_provenance` records where each field came from:

```json
{
  "email": { "source": "hunter.io:domain_search", "sourceId": "<sources.id>", "confidence": 96, "retrievedAt": "…", "hunterSources": 3 },
  "full_name": { "source": "hunter.io:domain_search", "sourceId": "…", "retrievedAt": "…" },
  "job_title": { "source": "manual", "retrievedAt": "…" },
  "verification": { "source": "hunter.io:email_verifier", "sourceId": "…", "retrievedAt": "…", "hunterStatus": "valid" }
}
```

Sources are `manual`, `hunter.io:domain_search`, `hunter.io:email_finder` and `hunter.io:email_verifier`. Contacts created through **New lead** are stamped `manual`. `contacts.email_confidence` holds Hunter's confidence (0–100) for the current address.

## Verifying one address

**Verify email** on the lead page calls `verifyContactEmail`. The action is refused for demo contacts and for the test key. If Hunter verified the address within `HUNTER_VERIFY_COOLDOWN_DAYS`, the stored result is returned without a call, and the button is disabled with the date. If verification fails, the contact is left exactly as it was and a `contact.email_verification_failed` audit entry is written. A successful check writes a history row and a `contact.email_verified` audit entry, then rescores.

## Interface

On a lead page, the contacts panel shows **Enrich contacts** and when it last ran. Each contact shows its confidence, email source, last verification (time and provider) and a **Verify email** button. Disabled buttons explain why. While a call runs, the button shows a spinner and stays disabled, so a double click cannot cause a second paid call. Errors appear inline and as a toast. The Contacts screen has a Confidence column.

## Smoke test

```bash
npm run hunter:smoke              # Hunter's test key: free, fictional data
npm run hunter:smoke:live         # HUNTER_API_KEY: spends about 1 search and 1–2 verification credits
npm run hunter:smoke:live -- --domain=example-agency.in
```

The live run reads the account balance before and after, runs Domain Search (limit 1), Email Finder for the person returned and the verifier. It prints masked addresses only (`a***@domain`), never names or the key, and writes nothing to the database.

## Status on 16 November 2026

The test-key smoke passes for all three endpoints. The configured live key authenticates; the Account endpoint answers (Free plan, no credits used). Every search and verification call returns **429 `restricted_account`**: Hunter has restricted the account. No credits were spent. The live path can be verified once the restriction is lifted by logging in to Hunter.
