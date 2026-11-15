import { buyingSignalDetector } from "./buying-signal-detector";
import { companyResearcher } from "./company-researcher";
import { leadQualifier } from "./lead-qualifier";
import { opportunityStrategist } from "./opportunity-strategist";
import { replyClassifier } from "./reply-classifier";
import { salesMessageGenerator } from "./sales-message-generator";
import type { PromptDefinition } from "./shared";

/**
 * The prompt registry. Each prompt lives in its own file in this folder; this file only
 * lists them. Only the AI infrastructure exists so far: none of these is wired into a
 * workflow yet.
 */
export const PROMPTS = {
  company_researcher: companyResearcher,
  buying_signal_detector: buyingSignalDetector,
  lead_qualifier: leadQualifier,
  opportunity_strategist: opportunityStrategist,
  sales_message_generator: salesMessageGenerator,
  reply_classifier: replyClassifier,
} as const;

export type PromptId = keyof typeof PROMPTS;

// Heterogeneous registry: each entry has its own input and output types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPrompt = PromptDefinition<any, any>;

export const PROMPT_LIST: readonly AnyPrompt[] = Object.values(PROMPTS);

export {
  buyingSignalDetector,
  companyResearcher,
  leadQualifier,
  opportunityStrategist,
  replyClassifier,
  salesMessageGenerator,
};
export { buildSystemPrompt, SECURITY_PREAMBLE, type PromptDefinition } from "./shared";
export { detectOptOutLanguage } from "./reply-classifier";
