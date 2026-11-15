# Outreach policies and compliance

These are HUNTER's operating rules. They are **not legal advice**. Before any live sending, have the channel policies reviewed against the law and platform terms that apply to you, including India's data protection and telecom commercial communication rules.

## Current state

**HUNTER cannot transmit anything today.** The compliance gate and the approval queue are built and tested. Live sending is off and the only delivery adapter is a mock that never transmits, so an approved message is stored as "approved", never as "sent". Automated sending, the follow-up sequencer and reply handling are not built.

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
| Compliance gate (single path for every send) | `src/server/services/compliance/gate.ts` | **Built, 21 unit tests, 5 browser tests** |
| Sending limits per day | `workspaces.daily_send_limit`, `campaigns.daily_limit`, `channel_policies.daily_limit` | Enforced by the gate, tested |

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

## What the gate checks

`evaluateOutbound` runs all 17 checks every time and reports each one, so a blocked message shows every reason, not just the first.

1. Workspace kill switch is off
2. A channel policy exists for the country and channel
3. The policy allows outbound
4. Automation is allowed for the channel, or a person is acting
5. A recorded opt-in exists where the channel requires one
6. The contact started the conversation where the channel requires it
7. The contact is not marked do-not-contact
8. The address is not on the suppression list
9. The contact has an address that has not failed verification
10. The outreach mode permits it (draft only never sends; human approval needs an approver). A campaign can make the mode stricter, never looser
11. The campaign, if any, is active
12. Workspace daily limit not reached
13. Campaign daily limit not reached
14. Channel daily limit not reached
15. The message has not already been processed
16. Every cited fact exists as an observed fact for that company, and an AI-drafted introduction cites at least one
17. An email tells the recipient how to opt out

If every check passes, `delivery` is `live` when `OUTBOUND_LIVE_SENDING=true` and `held` otherwise. A held message is recorded as approved and is not transmitted. Even when live, a message is only marked sent after a delivery adapter confirms it transmitted; the mock adapter never does.

The gate is deterministic code with no I/O. A model cannot call it with different rules, skip it or override its result. Its decision is stored on the message (`gate_result`), shown in the Conversation Centre, and written to the audit log.

**Limit of check 16:** it verifies the fact ids a draft cites. It does not yet read the message text for claims that cite nothing; that check arrives with message generation.

## Stopping a sequence

Follow-ups stop immediately on: reply received, unsubscribe, opt-out, hard bounce, complaint, manual stop. Adding a suppression stops enrolments and cancels unsent messages in the same database transaction, so there is no window in which a queued message can still go out.

## Opt-out

An unsubscribe creates a suppression for the address across all channels and a `consent_records` row with status withdrawn. A suppressed person can never be re-enrolled, in the same campaign or any other.

## Data handling

- Contact provenance is recorded for every contact (`sources`, `provenance_note`).
- `workspaces.data_retention_days` stores the retention period; the purge job is not built yet.
- Exports include contact email only for owners and admins, and never for do-not-contact people. Every export is audited.
