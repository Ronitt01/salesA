-- Contact enrichment (Hunter.io).
--
-- Reuses the existing schema: contacts hold the result, contact_verifications keeps
-- every verification with the provider's exact result, sources records each
-- enrichment run, audit_logs records what was done and the credits it used.
-- Only two columns are added.

-- The provider's confidence (0-100) in the stored email address. Null for addresses a
-- person entered. Used to decide whether a later result may replace an earlier one.
alter table public.contacts
  add column email_confidence smallint check (email_confidence between 0 and 100);

-- Where each enriched field came from, for example:
--   {"email": {"source": "hunter.io:domain_search", "sourceId": "<uuid>", "confidence": 94,
--              "retrievedAt": "2026-11-17T09:00:00Z"},
--    "job_title": {"source": "manual", "retrievedAt": "..."}}
-- A field with no entry, or with a source that is not a provider, is treated as
-- entered by a person and is never overwritten by enrichment.
alter table public.contacts
  add column field_provenance jsonb not null default '{}'::jsonb
  check (jsonb_typeof(field_provenance) = 'object');
