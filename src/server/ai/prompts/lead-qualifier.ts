import { z } from "zod";
import { unknownIds } from "../guards";
import { sanitiseInline, wrapUntrusted } from "../untrusted";
import { Enums, companyNameSchema, definePrompt, factInputSchema } from "./shared";

/*
 * Changelog
 * 1.0.0  First version.
 *
 * This prompt classifies evidence. It never produces a score, priority or
 * qualification decision: those come only from the deterministic scoring engine.
 */

const inputSchema = z.strictObject({
  company: z.strictObject({ name: companyNameSchema }),
  facts: z.array(factInputSchema).max(30),
  contact: z.strictObject({ jobTitle: z.string().max(200).nullable() }).nullable(),
});

const factIds = z.array(z.string().uuid()).max(10);

const outputSchema = z.strictObject({
  employeeRange: z.strictObject({
    value: z.enum([...Enums.employee_range, "unknown"]),
    basisFactIds: factIds,
  }),
  contactRole: z.strictObject({
    value: z.enum([...Enums.contact_role, "unknown"]),
    reason: z.string().min(1).max(200),
  }),
  relevantProblemFactIds: factIds,
  disqualifiers: z
    .array(z.strictObject({ reason: z.string().min(1).max(200), basisFactIds: factIds }))
    .max(5),
  openQuestions: z.array(z.string().min(1).max(200)).max(5),
});

export type LeadQualifierInput = z.infer<typeof inputSchema>;
export type LeadQualifierOutput = z.infer<typeof outputSchema>;

type ContactRole = LeadQualifierOutput["contactRole"]["value"];

const ROLE_RULES: Array<[ContactRole, RegExp]> = [
  ["owner_founder", /\b(founder|co-?founder|owner|proprietor|managing director|partner)\b/i],
  ["director_cxo", /\b(director|chief|ceo|coo|cto|cfo|president|head of)\b/i],
  ["operations", /\b(operations?|plant|dispatch|logistics|supply chain)\b/i],
  ["sales_marketing", /\b(sales|marketing|business development)\b/i],
  ["it", /\b(it|technology|systems|software)\b/i],
  ["finance", /\b(finance|accounts?|accountant)\b/i],
];

export const leadQualifier = definePrompt<LeadQualifierInput, LeadQualifierOutput>({
  id: "lead_qualifier",
  version: "1.0.0",
  description: "Classifies stored evidence (team size, contact role, problems, disqualifiers) for the scoring engine. Produces no score.",
  inputSchema,
  outputSchema,
  maxTokens: 8_000,
  effort: "medium",
  system: `Task: classify the evidence HUNTER holds about one company so its deterministic scoring engine can use it. You do not score, rank, prioritise or qualify the lead, and you do not recommend whether to contact it.

- employeeRange: choose a range only when a fact states or directly implies the team size, and cite those fact ids. Otherwise use "unknown" with no ids.
- contactRole: classify the contact's job title into one category, or "unknown". Give a short reason.
- relevantProblemFactIds: ids of facts showing a possible operational problem that a technology service could address.
- disqualifiers: facts suggesting the company is outside the target market (fewer than 10 or more than 200 employees, outside India, or not a business), each with the fact ids it rests on.
- openQuestions: what a salesperson should verify, up to five.

Cite only ids from the stored facts list. Each fact is in square brackets before its statement.`,
  buildUser: (input) =>
    [
      `Company: ${sanitiseInline(input.company.name)}`,
      "",
      "Stored facts (derived from outside sources):",
      "",
      wrapUntrusted([
        {
          source: "hunter:stored_facts",
          kind: "stored facts",
          text: input.facts.length === 0 ? "(no facts on record)" : input.facts.map((f) => `[${f.id}] ${f.statement}`).join("\n"),
        },
      ]),
      "",
      "Contact job title:",
      "",
      wrapUntrusted([{ source: "hunter:contact", kind: "job title", text: input.contact?.jobTitle ?? "(no contact on record)" }]),
    ].join("\n"),
  untrustedText: (input) => [input.company.name, ...input.facts.map((f) => f.statement), input.contact?.jobTitle ?? ""],
  guard: (output, input) => {
    const allowed = input.facts.map((f) => f.id);
    const cited = [
      ...output.employeeRange.basisFactIds,
      ...output.relevantProblemFactIds,
      ...output.disqualifiers.flatMap((d) => d.basisFactIds),
    ];
    const issues = unknownIds(cited, allowed).map((id) => `Cites fact ${id}, which was not supplied.`);
    if (output.employeeRange.value !== "unknown" && output.employeeRange.basisFactIds.length === 0) {
      issues.push("An employee range was chosen without citing a fact.");
    }
    if (output.employeeRange.value === "unknown" && output.employeeRange.basisFactIds.length > 0) {
      issues.push("An unknown employee range cites facts.");
    }
    return issues;
  },
  mockFixture: (input) => {
    const title = input.contact?.jobTitle ?? "";
    const role = ROLE_RULES.find(([, pattern]) => pattern.test(title))?.[0] ?? "unknown";
    return {
      employeeRange: { value: "unknown", basisFactIds: [] },
      contactRole: {
        value: role,
        reason: role === "unknown" ? "Synthetic mock: no keyword matched the job title." : "Synthetic mock: keyword match on the job title.",
      },
      relevantProblemFactIds: [],
      disqualifiers: [],
      openQuestions: ["Synthetic mock output: no assessment was performed."],
    };
  },
  example: {
    company: { name: "Apex Logistics Solutions" },
    facts: [
      { id: "1f0c6a2e-5b8d-4c1e-9a77-3d2b1c0e4f11", statement: "States a team of about 120 people serving manufacturers and traders." },
      { id: "6a9d2b44-0e1f-4a3b-8c5d-7e6f5a4b3c22", statement: "Offers shipment status by phone or email request rather than a self-service portal." },
    ],
    contact: { jobTitle: "Head of Operations" },
  },
});
