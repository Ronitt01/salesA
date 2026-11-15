import { z } from "zod";
import { sanitiseUntrusted, wrapUntrusted } from "../untrusted";
import { Enums, definePrompt } from "./shared";

/*
 * Changelog
 * 1.0.0  First version.
 */

const inputSchema = z.strictObject({
  latestMessage: z.strictObject({ text: z.string().min(1).max(10_000) }),
  priorMessages: z
    .array(z.strictObject({ direction: z.enum(["outbound", "inbound"]), text: z.string().min(1).max(5_000) }))
    .max(10),
});

const outputSchema = z.strictObject({
  intent: z.enum(Enums.reply_intent),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(300),
  requiresHuman: z.boolean(),
  optOutRequested: z.boolean(),
});

export type ReplyClassifierInput = z.infer<typeof inputSchema>;
export type ReplyClassifierOutput = z.infer<typeof outputSchema>;
type Intent = ReplyClassifierOutput["intent"];

/**
 * Deterministic opt-out detection. When reply processing is built it must treat a
 * match as an opt-out whatever the model says: a model can lower the chance of
 * missing an opt-out, but must never be the only safeguard against it.
 */
export function detectOptOutLanguage(text: string): boolean {
  return /\b(unsubscribe|opt[\s-]?out|stop (emailing|messaging|contacting|writing)|do not (contact|email|message|write)|don't (contact|email|message|write)|remove me|take me off)\b/i.test(
    sanitiseUntrusted(text),
  );
}

/** Keyword rules used only by the mock fixture, in priority order. */
const MOCK_RULES: Array<[Intent, RegExp]> = [
  ["complaint", /\b(spam|harass\w*|report (you|this)|legal action|complain\w*)\b/i],
  ["out_of_office", /\b(out of (the )?office|on leave|away until|auto-?reply|ooo)\b/i],
  ["wants_pricing", /\b(price|pricing|cost|quote|quotation|budget)\b/i],
  ["wants_meeting", /\b(call|meeting|meet|schedule|speak|connect|catch up)\b/i],
  ["not_interested", /\b(not interested|no thanks|not a priority|not required)\b/i],
  ["objection", /\b(already (use|have)|why would we|not convinced|too expensive)\b/i],
  ["requests_information", /\b(share|more information|details|brochure|examples?|case stud\w*)\b/i],
  ["interested", /\b(interested|tell me more|sounds good|relevant for us)\b/i],
];

export const replyClassifier = definePrompt<ReplyClassifierInput, ReplyClassifierOutput>({
  id: "reply_classifier",
  version: "1.0.0",
  description: "Classifies the latest prospect reply into one of ten intents, flagging opt-outs and replies a person must read.",
  inputSchema,
  outputSchema,
  maxTokens: 4_000,
  effort: "low",
  system: `Task: classify the latest reply in an email conversation between the agency and a prospect.

Intents:
- interested: positive, wants to continue
- wants_meeting: asks for or agrees to a call or meeting
- wants_pricing: asks about cost or pricing
- requests_information: asks for details, documents or examples
- objection: raises a concern or a reason against, without ending the conversation
- not_interested: declines
- unsubscribe: asks not to be contacted again, in any wording
- out_of_office: an automatic or absence reply
- complaint: upset about being contacted, or mentions spam, legal action or reporting
- human_review: unclear, mixed, sensitive, or anything a person should read

Set optOutRequested to true whenever the sender asks not to be contacted again, whatever else the message says. Set requiresHuman to true for complaint, human_review, and anything ambiguous or sensitive. confidence is from 0 to 1. rationale is one sentence and must not quote personal details. Classify only; do not draft a reply.`,
  buildUser: (input) =>
    [
      "Earlier messages, oldest first:",
      "",
      input.priorMessages.length === 0
        ? "(none)"
        : wrapUntrusted(input.priorMessages.map((m) => ({ source: `hunter:${m.direction}_message`, kind: `${m.direction} email`, text: m.text }))),
      "",
      "Latest reply to classify:",
      "",
      wrapUntrusted([{ source: "hunter:latest_reply", kind: "inbound email", text: input.latestMessage.text }]),
    ].join("\n"),
  untrustedText: (input) => [input.latestMessage.text, ...input.priorMessages.map((m) => m.text)],
  guard: (output) => {
    const issues: string[] = [];
    if (output.intent === "unsubscribe" && !output.optOutRequested) issues.push("An unsubscribe intent must set optOutRequested.");
    if ((output.intent === "complaint" || output.intent === "human_review") && !output.requiresHuman) {
      issues.push(`A ${output.intent} intent must set requiresHuman.`);
    }
    return issues;
  },
  mockFixture: (input) => {
    const text = input.latestMessage.text;
    if (detectOptOutLanguage(text)) {
      return {
        intent: "unsubscribe",
        confidence: 0.6,
        rationale: "Synthetic mock: opt-out keyword rule. No model was used.",
        requiresHuman: false,
        optOutRequested: true,
      };
    }
    const match = MOCK_RULES.find(([, pattern]) => pattern.test(text));
    const intent: Intent = match ? match[0] : "human_review";
    return {
      intent,
      confidence: match ? 0.6 : 0.3,
      rationale: match ? `Synthetic mock: keyword rule for ${intent}. No model was used.` : "Synthetic mock: no keyword rule matched. No model was used.",
      requiresHuman: intent === "complaint" || intent === "human_review",
      optOutRequested: false,
    };
  },
  example: {
    latestMessage: { text: "Thanks for writing. This is relevant for us. Can we speak sometime next week?" },
    priorMessages: [
      {
        direction: "outbound",
        text: "Hello Vikram, I noticed your field sales team covers several districts. How do you keep track of follow-ups today?",
      },
    ],
  },
});
