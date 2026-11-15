# Outreach policies and compliance

These are HUNTER's operating rules. They are **not legal advice**. Before any live sending, have the channel policies reviewed against the law and platform terms that apply to you, including India's data protection and telecom commercial communication rules.

## Current state

**HUNTER cannot send anything today.** The outreach engine (Phase 4) is not built. What exists is the policy data, the safety settings and the database guards, all of which the engine will have to pass through.

## Layers of protection

| Layer | Where | Status |
|---|---|---|
| Live-sending switch `OUTBOUND_LIVE_SENDING` (default `false`) | Server environment | In place |
| Kill switch per workspace | `workspaces.outbound_kill_switch`, Settings | In place (stored, audited) |
| Outreach mode: draft only / human approval / controlled autonomy | `workspaces.outreach_mode`, Settings | In place; default is human approval |
| Channel policy per country | `channel_policies` | Seeded for India; no row means blocked |
| Suppression list | `suppressions` + trigger | **Enforced by the database, tested** |
| Do-not-contact flag | `contacts.do_not_contact` + trigger | **Enforced by the database, tested** |
| Stop on suppression | `apply_suppression` trigger | **Enforced by the database, tested** |
| Idempotency | `messages (tenant_id, idempotency_key)` unique | **Enforced by the database, tested** |
| Compliance gate service (single path for every send) | Planned: `src/server/services/compliance/gate.ts` | Not built |
| Sending limits per day | `workspaces.daily_send_limit`, `campaigns.daily_limit`, `channel_policies.daily_limit` | Stored; enforcement is part of the gate |

## Channel rules seeded for India

| Channel | Outbound | Automation | Condition |
|---|---|---|---|
| Email | Allowed | Permitted, subject to outreach mode | Individualised business email to a role-relevant contact; sender identified; working opt-out in every message |
| LinkedIn | Human-led only | Never | HUNTER prepares notes for a person. No scraping, no automated activity |
| WhatsApp | Allowed with recorded opt-in | Off until a WhatsApp Business Platform setup is approved | Never message scraped numbers |
| Telegram | Only after the user starts the conversation | Off | Bots do not initiate |
| Voice | Blocked | Off | Needs a compliant business telephony setup; inbound and requested callbacks only |
| Referral | Human-led | Never | Introductions are made by a person |
| Inbound | Allowed | Permitted | Replies to enquiries the prospect submitted |

A contact detail being publicly visible is not treated as permission to use every channel.

## What the gate will check, in order

For every outbound message, however it was created:

1. `OUTBOUND_LIVE_SENDING` is true (otherwise the message is recorded as simulated, never sent)
2. Workspace kill switch is off
3. A channel policy exists for the country and channel, and allows outbound
4. Automation is allowed for the channel, or a person is sending
5. Required consent or inbound initiation is on record
6. The address is not suppressed and the contact is not do-not-contact
7. The outreach mode permits this action (draft only never sends; human approval needs an approver)
8. Daily limits for the workspace, campaign and channel are not exceeded
9. The idempotency key has not been used
10. The message cites only stored facts

The gate is deterministic code. A model cannot call it with different rules, skip it or override its result. Its decision is stored on the message (`gate_result`) and in the audit log.

## Stopping a sequence

Follow-ups stop immediately on: reply received, unsubscribe, opt-out, hard bounce, complaint, manual stop. Adding a suppression stops enrolments and cancels unsent messages in the same database transaction, so there is no window in which a queued message can still go out.

## Opt-out

An unsubscribe creates a suppression for the address across all channels and a `consent_records` row with status withdrawn. A suppressed person can never be re-enrolled, in the same campaign or any other.

## Data handling

- Contact provenance is recorded for every contact (`sources`, `provenance_note`).
- `workspaces.data_retention_days` stores the retention period; the purge job is not built yet.
- Exports include contact email only for owners and admins, and never for do-not-contact people. Every export is audited.
