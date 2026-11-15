/**
 * Handling of untrusted content: website text, inbound email, anything HUNTER did not
 * write itself.
 *
 * Untrusted text is only ever placed in the user turn, inside <untrusted_document>
 * blocks. Before wrapping, any text that could close or forge those blocks is
 * removed, as are control and invisible characters (including bidirectional
 * overrides that can hide instructions from a reviewer). The system prompt tells the
 * model that block content is data. The real defences sit after the model: strict
 * output schemas and guards that check every claim against the input.
 */

const BLOCK_TAG = /<\s*\/?\s*(untrusted[\s_-]*document|hunter[\s_-]*reference)\b[^>]*>/gi;
// C0 controls except tab and newline, DEL, zero-width characters, bidi controls, BOM.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function sanitiseUntrusted(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(INVISIBLE, "").replace(BLOCK_TAG, "[removed tag]");
}

/** For short single-line values such as a company name. */
export function sanitiseInline(text: string, maxLength = 300): string {
  return sanitiseUntrusted(text).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function attribute(value: string): string {
  return sanitiseInline(value, 500)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface UntrustedDocument {
  /** URL or label shown to the model, and used by guards to check citations. */
  source: string;
  kind: string;
  text: string;
}

export function wrapUntrusted(documents: UntrustedDocument[]): string {
  return documents
    .map(
      (doc, index) =>
        `<untrusted_document index="${index + 1}" kind="${attribute(doc.kind)}" source="${attribute(doc.source)}">\n` +
        `${sanitiseUntrusted(doc.text).trim()}\n` +
        `</untrusted_document>`,
    )
    .join("\n\n");
}

/** HUNTER's own reference data (service catalogue, sender details). Trusted, but still delimited. */
export function hunterReference(name: string, content: string): string {
  return `<hunter_reference name="${attribute(name)}">\n${sanitiseUntrusted(content).trim()}\n</hunter_reference>`;
}

const INJECTION_PATTERNS: Array<[id: string, pattern: RegExp]> = [
  [
    "ignore_instructions",
    /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|system|the)\b[^.\n]{0,25}\b(instructions?|prompts?|rules?|directions?|guidelines?)\b/i,
  ],
  ["role_reassignment", /\b(you are now|act as (an?|the)|pretend (to be|you are)|from now on,? you|new instructions?:)/i],
  ["prompt_extraction", /\b(reveal|print|show|repeat|output|tell me)\b[^.\n]{0,30}\b(system prompt|your instructions|hidden (prompt|instructions)|api key)\b/i],
  ["delimiter_spoof", /<\s*\/?\s*(untrusted[\s_-]*document|hunter[\s_-]*reference|system|instructions?)\b/i],
  ["chat_role_marker", /^\s*(system|assistant|human|developer)\s*:/im],
  ["outcome_tampering", /\b(set|mark|give|assign|rate|score)\b[^.\n]{0,30}\b(score|qualified|priority|approved|100\s*\/\s*100)\b/i],
  ["ai_addressed", /\b(ai|llm|language model|chatbot|assistant)s?\b[^.\n]{0,20}\b(reading|processing|analy[sz]ing) this\b/i],
];

/**
 * Detects common prompt-injection phrasing in untrusted text. The result is recorded
 * and logged; it does not block the call, because legitimate pages can contain such
 * phrases and the post-model guards already contain the damage.
 */
export function detectInjection(texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const [id, pattern] of INJECTION_PATTERNS) if (pattern.test(text)) found.add(id);
  }
  return [...found].sort();
}
