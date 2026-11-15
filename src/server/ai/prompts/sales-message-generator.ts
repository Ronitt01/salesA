import { z } from "zod";
import { checkNoPromises, normaliseForMatch, unknownIds } from "../guards";
import { hunterReference, sanitiseInline, wrapUntrusted } from "../untrusted";
import { companyNameSchema, definePrompt, factInputSchema } from "./shared";

/*
 * Changelog
 * 1.0.0  First version.
 *
 * A draft from this prompt is never sent directly. It is stored for human approval and
 * every send still passes the compliance gate, whose supported-facts check reads the
 * citedFactIds produced here.
 */

const inputSchema = z.strictObject({
  sender: z.strictObject({ name: z.string().min(1).max(120), company: z.string().min(1).max(160) }),
  recipient: z.strictObject({ firstName: z.string().min(1).max(80), jobTitle: z.string().max(200).nullable() }),
  company: z.strictObject({ name: companyNameSchema }),
  facts: z.array(factInputSchema).min(1).max(10),
  service: z.strictObject({ name: z.string().min(1).max(160), description: z.string().max(2000) }),
  outreachAngle: z.string().max(400).nullable(),
  step: z.enum(["introduction", "insight", "closing"]),
  /** Written by HUNTER, not the model. Must appear in the body unchanged. */
  optOutLine: z.string().min(10).max(300),
});

const outputSchema = z.strictObject({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(2500),
  citedFactIds: z.array(z.string().uuid()).max(3),
});

export type SalesMessageGeneratorInput = z.infer<typeof inputSchema>;
export type SalesMessageGeneratorOutput = z.infer<typeof outputSchema>;

const PLACEHOLDER = /\[[A-Z][^\]]{0,40}\]|\{\{[^}]*\}\}|<(name|company|first ?name)>/i;

export const salesMessageGenerator = definePrompt<SalesMessageGeneratorInput, SalesMessageGeneratorOutput>({
  id: "sales_message_generator",
  version: "1.0.0",
  description: "Drafts one individual business email for human approval, citing only stored facts.",
  inputSchema,
  outputSchema,
  maxTokens: 8_000,
  effort: "medium",
  system: `Task: write one short, individual business email from a named person at the agency to a named person at a prospect company.

- Plain, polite Indian business English. 60 to 160 words for an introduction, shorter for follow-ups.
- Refer only to facts in the supplied list, and put the ids of the facts you used in citedFactIds. An introduction must use at least one fact.
- Do not mention prices, discounts, savings, return on investment, guarantees, delivery dates or results achieved for other clients.
- Do not claim to have visited, called or met the company, and do not invent shared connections.
- Ask one simple question. No pressure, urgency or flattery.
- Sign off with the sender's name and company exactly as supplied, then put the opt-out line exactly as supplied on its own final line.
- Leave no placeholders.

Steps: introduction is the first contact; insight is a short follow-up offering one relevant observation; closing is a polite final message that makes it easy to say no.`,
  buildUser: (input) =>
    [
      `Step: ${input.step}`,
      `Recipient first name: ${sanitiseInline(input.recipient.firstName, 80)}`,
      `Recipient job title: ${input.recipient.jobTitle ? sanitiseInline(input.recipient.jobTitle, 200) : "unknown"}`,
      `Company: ${sanitiseInline(input.company.name)}`,
      "",
      "Stored facts (derived from outside sources):",
      "",
      wrapUntrusted([
        { source: "hunter:stored_facts", kind: "stored facts", text: input.facts.map((f) => `[${f.id}] ${f.statement}`).join("\n") },
      ]),
      "",
      "Suggested angle (from an earlier step):",
      "",
      wrapUntrusted([{ source: "hunter:outreach_angle", kind: "outreach angle", text: input.outreachAngle ?? "(none)" }]),
      "",
      hunterReference(
        "sender_and_service",
        [
          `sender name: ${input.sender.name}`,
          `sender company: ${input.sender.company}`,
          `service: ${input.service.name}`,
          `service description: ${input.service.description}`,
          `opt-out line: ${input.optOutLine}`,
        ].join("\n"),
      ),
    ].join("\n"),
  untrustedText: (input) => [
    input.recipient.firstName,
    input.recipient.jobTitle ?? "",
    input.company.name,
    input.outreachAngle ?? "",
    ...input.facts.map((f) => f.statement),
  ],
  guard: (output, input) => {
    const issues = unknownIds(output.citedFactIds, input.facts.map((f) => f.id)).map(
      (id) => `Cites fact ${id}, which was not supplied.`,
    );
    if (input.step === "introduction" && output.citedFactIds.length === 0) issues.push("An introduction must cite at least one fact.");
    if (!normaliseForMatch(output.body).includes(normaliseForMatch(input.optOutLine))) {
      issues.push("The body does not contain the opt-out line exactly as supplied.");
    }
    if (PLACEHOLDER.test(output.subject) || PLACEHOLDER.test(output.body)) issues.push("The message contains an unfilled placeholder.");
    issues.push(...checkNoPromises({ subject: output.subject, body: output.body }));
    return issues;
  },
  mockFixture: (input) => ({
    subject: `Synthetic draft: a question for ${sanitiseInline(input.company.name, 80)}`,
    body: [
      `Hello ${sanitiseInline(input.recipient.firstName, 80)},`,
      "",
      "This is a synthetic draft from HUNTER's mock provider. No model wrote it and it must not be sent.",
      "",
      `It cites one stored fact: ${sanitiseInline(input.facts[0].statement, 300)}`,
      "",
      "How does your team keep track of follow-ups today?",
      "",
      `${input.sender.name}`,
      `${input.sender.company}`,
      "",
      input.optOutLine,
    ].join("\n"),
    citedFactIds: [input.facts[0].id],
  }),
  example: {
    sender: { name: "Asha Kulkarni", company: "Demo Agency" },
    recipient: { firstName: "Vikram", jobTitle: "Managing Director" },
    company: { name: "Punjab Fresh Distributors" },
    facts: [{ id: "0b1c2d3e-4f50-4a61-8b72-c3d4e5f60718", statement: "Describes a field sales team covering several districts." }],
    service: {
      name: "CRM development and implementation",
      description: "A central CRM for enquiries, follow-ups and pipeline visibility across teams and branches.",
    },
    outreachAngle: "Open with the field sales team and ask how enquiries are shared.",
    step: "introduction",
    optOutLine: 'If this is not relevant, reply "unsubscribe" and I will not write again.',
  },
});
