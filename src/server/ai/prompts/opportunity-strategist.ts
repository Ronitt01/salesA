import { z } from "zod";
import { checkNoPromises, unknownIds } from "../guards";
import { hunterReference, sanitiseInline, wrapUntrusted } from "../untrusted";
import { companyNameSchema, definePrompt, factInputSchema } from "./shared";

/*
 * Changelog
 * 1.0.0  First version.
 */

const inputSchema = z.strictObject({
  company: z.strictObject({ name: companyNameSchema, industry: z.string().max(120).nullable() }),
  facts: z.array(factInputSchema).min(1).max(20),
  hypotheses: z.array(z.string().min(1).max(400)).max(10),
  services: z
    .array(
      z.strictObject({
        slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
        name: z.string().min(1).max(160),
        description: z.string().max(2000),
        problemsSolved: z.array(z.string().max(300)).max(20),
      }),
    )
    .min(1)
    .max(15),
});

const outputSchema = z.strictObject({
  /** Null when no catalogue service clearly fits. */
  recommendedServiceSlug: z.string().max(80).nullable(),
  observedFactIds: z.array(z.string().uuid()).max(5),
  problemHypothesis: z.string().min(1).max(500),
  relevanceRationale: z.string().min(1).max(600),
  possibleImpact: z.string().min(1).max(400),
  validationQuestions: z.array(z.string().min(1).max(250)).min(1).max(5),
  outreachAngle: z.string().min(1).max(400),
});

export type OpportunityStrategistInput = z.infer<typeof inputSchema>;
export type OpportunityStrategistOutput = z.infer<typeof outputSchema>;

export const opportunityStrategist = definePrompt<OpportunityStrategistInput, OpportunityStrategistOutput>({
  id: "opportunity_strategist",
  version: "1.0.0",
  description: "Matches evidenced problems to one catalogue service as a hypothesis, with validation questions and no promises.",
  inputSchema,
  outputSchema,
  maxTokens: 16_000,
  effort: "medium",
  system: `Task: propose how one service from the agency's catalogue could help this company, as a hypothesis for a salesperson to validate.

- recommendedServiceSlug: a slug from the service catalogue in the hunter_reference block. If no service clearly fits the facts, use null and explain why in relevanceRationale.
- observedFactIds: the ids of the supplied facts the recommendation rests on, 1 to 5 when a service is chosen.
- problemHypothesis: the possible operational problem, phrased as a possibility.
- relevanceRationale: why the service may address it, tied to the cited facts.
- possibleImpact: qualitative only. No numbers, percentages, money, savings, return on investment, guarantees or timeframes.
- validationQuestions: 1 to 5 questions that would confirm or rule out the problem.
- outreachAngle: one sentence on how a first message could open, referring to one observed fact.

Earlier hypotheses are suggestions from a previous step; use them only where the facts support them.`,
  buildUser: (input) =>
    [
      `Company: ${sanitiseInline(input.company.name)}`,
      `Industry: ${input.company.industry ? sanitiseInline(input.company.industry) : "unknown"}`,
      "",
      "Stored facts (derived from outside sources):",
      "",
      wrapUntrusted([
        { source: "hunter:stored_facts", kind: "stored facts", text: input.facts.map((f) => `[${f.id}] ${f.statement}`).join("\n") },
      ]),
      "",
      "Earlier hypotheses:",
      "",
      wrapUntrusted([
        { source: "hunter:hypotheses", kind: "hypotheses", text: input.hypotheses.length ? input.hypotheses.join("\n") : "(none)" },
      ]),
      "",
      hunterReference(
        "service_catalogue",
        input.services
          .map((s) => `slug: ${s.slug}\nname: ${s.name}\ndescription: ${s.description}\nproblems solved: ${s.problemsSolved.join("; ")}`)
          .join("\n\n"),
      ),
    ].join("\n"),
  untrustedText: (input) => [input.company.name, input.company.industry ?? "", ...input.facts.map((f) => f.statement), ...input.hypotheses],
  guard: (output, input) => {
    const issues = unknownIds(output.observedFactIds, input.facts.map((f) => f.id)).map(
      (id) => `Cites fact ${id}, which was not supplied.`,
    );
    if (output.recommendedServiceSlug !== null) {
      if (!input.services.some((s) => s.slug === output.recommendedServiceSlug)) {
        issues.push("Recommends a service that is not in the catalogue.");
      }
      if (output.observedFactIds.length === 0) issues.push("Recommends a service without citing a fact.");
    }
    issues.push(
      ...checkNoPromises({
        problemHypothesis: output.problemHypothesis,
        relevanceRationale: output.relevanceRationale,
        possibleImpact: output.possibleImpact,
        outreachAngle: output.outreachAngle,
      }),
    );
    return issues;
  },
  mockFixture: (input) => ({
    recommendedServiceSlug: input.services[0].slug,
    observedFactIds: input.facts.slice(0, 2).map((f) => f.id),
    problemHypothesis: "Synthetic mock: no problem was analysed. This placeholder exists to test the pipeline.",
    relevanceRationale: `Synthetic mock: the first catalogue service (${input.services[0].name}) was selected without analysis.`,
    possibleImpact: "Synthetic mock: no impact was assessed.",
    validationQuestions: ["Synthetic mock: how are enquiries recorded and followed up today?"],
    outreachAngle: "Synthetic mock: open with the first stored fact and ask one question.",
  }),
  example: {
    company: { name: "Punjab Fresh Distributors", industry: "Wholesale and distribution" },
    facts: [
      { id: "0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718", statement: "Describes a field sales team covering several districts." },
      { id: "9f8e7d6c-5b4a-4392-a817-263544536271", statement: "Shows one shared email address for enquiries; no enquiry tracking tool is visible." },
    ],
    hypotheses: ["Dealer enquiries may be tracked separately by each salesperson."],
    services: [
      {
        slug: "crm-implementation",
        name: "CRM development and implementation",
        description: "A central CRM for enquiries, follow-ups and pipeline visibility across teams and branches.",
        problemsSolved: ["Enquiries tracked in spreadsheets or personal phones", "No shared view of follow-ups"],
      },
      {
        slug: "workflow-automation",
        name: "n8n workflow automation",
        description: "Automated hand-offs between the tools a business already uses.",
        problemsSolved: ["Manual copying between systems"],
      },
    ],
  },
});
