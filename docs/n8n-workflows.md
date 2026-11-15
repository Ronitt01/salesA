# n8n workflows

## Current state

**The n8n integration is not built.** There are no webhook endpoints, no workflow runner and no importable templates yet. What exists:

- The six workflow definitions as rows in `workflow_jobs` (created for every workspace by `bootstrapWorkspace`).
- `workflow_executions` with status, trigger, attempt, duration, error message and detail, and an idempotency key.
- The Automations screen, which shows workflows, their mode, last execution, success rate and execution history with errors.
- Synthetic execution history in the demo workspace, labelled as demo.

With no `N8N_BASE_URL` set, the Automations screen states that the system is in local simulation mode and that nothing is being scheduled.

## The six workflows

| Key | Name | Schedule (cron, IST) | What it will do |
|---|---|---|---|
| WF-01 | Company Discovery | `0 6 * * 1-6` | Build search queries per industry and geography, call the search provider, collect candidates, deduplicate by domain, create companies with source and date |
| WF-02 | Company Research and Signal Detection | `30 6 * * 1-6` | Read permitted public pages, store observed facts with evidence, detect signals with expiry |
| WF-03 | Contact Verification and Qualification | `0 7 * * 1-6` | Verify contacts, compute reliability, run the scoring engine |
| WF-04 | Opportunity and Outreach Draft Generation | `30 7 * * 1-6` | Match evidenced problems to services, draft outreach for approval |
| WF-05 | Incoming Reply Processing | `*/30 * * * *` | Classify replies, stop sequences, apply opt-outs, draft responses |
| WF-06 | Meeting Scheduling and CRM Update | `0 * * * *` | Propose slots, record bookings the prospect selects, write activities |

## Intended design

HUNTER holds the logic; n8n triggers it.

```
n8n (cron or event)
   │  POST /api/webhooks/n8n/{workflow_key}
   │  X-Hunter-Signature: sha256=HMAC(body, N8N_WEBHOOK_SECRET)
   │  X-Hunter-Idempotency-Key: <unique per run>
   ▼
HUNTER
   1. verify the signature against the raw body (constant-time compare)
   2. reject a repeated idempotency key
   3. create a workflow_executions row (queued → running)
   4. run the typed workflow function
   5. record succeeded / failed with error detail
   ▼
JSON result back to n8n
```

Design points to keep when building it:

- **Each workflow is a TypeScript function** in `src/server/workflows/`, callable three ways: from n8n, from "Run now" in the UI, and in local simulation mode. One implementation, three triggers.
- **Signature validation uses the raw request body** (`await request.text()`), before any JSON parsing.
- **Failures are recorded, not swallowed.** A failed run stores `error_message` and `error_detail`; retry creates a new execution with `retry_of` and `attempt + 1`.
- **Pause** sets `workflow_jobs.status = 'paused'`; a paused workflow rejects triggers with a clear response.
- **n8n never holds business rules or the compliance gate.** It cannot send a message directly; it can only ask HUNTER to run WF-04/05, which go through the gate.
- **No credentials in templates.** Importable JSON will reference n8n credential names that the operator creates.

## Environment

| Variable | Purpose |
|---|---|
| `N8N_BASE_URL` | When set, the UI treats n8n as connected |
| `N8N_WEBHOOK_SECRET` | Shared secret for HMAC signatures in both directions |
