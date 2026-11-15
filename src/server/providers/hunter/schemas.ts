import { z } from "zod";

/**
 * Zod schemas for the Hunter.io API v2 responses HUNTER uses.
 *
 * Field names follow https://hunter.io/api-documentation/v2 and were checked against
 * live responses from Hunter's test credential. Objects are not strict: Hunter may add
 * fields, and unknown fields are dropped. Required fields that HUNTER relies on are
 * validated; anything optional in practice is nullable.
 */

const nullableString = z.string().nullable().optional().transform((v) => v ?? null);
const nullableBoolean = z.boolean().nullable().optional().transform((v) => v ?? null);

export const hunterSourceSchema = z.object({
  domain: nullableString,
  uri: nullableString,
  extracted_on: nullableString,
  last_seen_on: nullableString,
  still_on_page: nullableBoolean,
});

/** Verification stored by Hunter for an address it already knows about. */
export const hunterStoredVerificationSchema = z
  .object({ date: nullableString, status: nullableString })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const domainSearchEmailSchema = z.object({
  value: z.string().min(3),
  type: nullableString,
  confidence: z.number().min(0).max(100).nullable().optional().transform((v) => v ?? null),
  provenance: nullableString,
  sources: z.array(hunterSourceSchema).optional().default([]),
  first_name: nullableString,
  last_name: nullableString,
  position: nullableString,
  position_raw: nullableString,
  seniority: nullableString,
  department: nullableString,
  decision_maker: nullableBoolean,
  linkedin: nullableString,
  phone_number: nullableString,
  verification: hunterStoredVerificationSchema,
});

export const domainSearchResponseSchema = z.object({
  data: z.object({
    domain: z.string().min(1),
    disposable: nullableBoolean,
    webmail: nullableBoolean,
    accept_all: nullableBoolean,
    pattern: nullableString,
    organization: nullableString,
    emails: z.array(domainSearchEmailSchema).default([]),
  }),
  meta: z
    .object({ results: z.number().nullable().optional(), limit: z.number().nullable().optional(), offset: z.number().nullable().optional() })
    .optional(),
});

export const emailFinderResponseSchema = z.object({
  data: z.object({
    first_name: nullableString,
    last_name: nullableString,
    // Null when Hunter finds no address. No credit is charged in that case.
    email: nullableString,
    score: z.number().min(0).max(100).nullable().optional().transform((v) => v ?? null),
    domain: nullableString,
    accept_all: nullableBoolean,
    position: nullableString,
    company: nullableString,
    provenance: nullableString,
    sources: z.array(hunterSourceSchema).optional().default([]),
    verification: hunterStoredVerificationSchema,
  }),
});

/** Every verifier status Hunter documents. Anything else is treated as unknown. */
export const HUNTER_VERIFIER_STATUSES = ["valid", "invalid", "accept_all", "webmail", "disposable", "unknown"] as const;
export type HunterVerifierStatus = (typeof HUNTER_VERIFIER_STATUSES)[number];

export const emailVerifierResponseSchema = z.object({
  data: z.object({
    // Kept as the exact string Hunter returned; HUNTER maps it separately.
    status: z.string().min(1),
    score: z.number().min(0).max(100).nullable().optional().transform((v) => v ?? null),
    email: z.string().min(3),
    regexp: nullableBoolean,
    gibberish: nullableBoolean,
    disposable: nullableBoolean,
    webmail: nullableBoolean,
    mx_records: nullableBoolean,
    smtp_server: nullableBoolean,
    smtp_check: nullableBoolean,
    accept_all: nullableBoolean,
    block: nullableBoolean,
    sources: z.array(hunterSourceSchema).optional().default([]),
  }),
});

const usageSchema = z
  .object({ used: z.number().nullable().optional(), available: z.number().nullable().optional() })
  .partial()
  .nullable()
  .optional();

export const accountResponseSchema = z.object({
  data: z.object({
    plan_name: nullableString,
    reset_date: nullableString,
    requests: z.object({ credits: usageSchema, searches: usageSchema, verifications: usageSchema }).partial().nullable().optional(),
  }),
});

export const hunterErrorBodySchema = z.object({
  errors: z.array(z.object({ id: z.string().optional(), code: z.number().optional(), details: z.string().optional() })).min(1),
});

export type DomainSearchResponse = z.infer<typeof domainSearchResponseSchema>;
export type DomainSearchEmail = z.infer<typeof domainSearchEmailSchema>;
export type EmailFinderResponse = z.infer<typeof emailFinderResponseSchema>;
export type EmailVerifierResponse = z.infer<typeof emailVerifierResponseSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type HunterSource = z.infer<typeof hunterSourceSchema>;
