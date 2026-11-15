import { sanitiseUntrusted } from "./untrusted";

/**
 * Post-validation guards. Pure functions that check a schema-valid output against the
 * input it was produced from. A failed guard rejects the output: the model cannot
 * cite a page it was not given, quote words that are not on the page, reference a fact
 * HUNTER does not hold, or make a promise HUNTER does not allow.
 */

export function normaliseForMatch(text: string): string {
  return sanitiseUntrusted(text)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const MIN_QUOTE_LENGTH = 8;

/** True when the quote appears in the source, ignoring case, spacing and quote styles. */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normaliseForMatch(quote);
  return q.length >= MIN_QUOTE_LENGTH && normaliseForMatch(source).includes(q);
}

export interface EvidenceClaim {
  label: string;
  url: string;
  quote: string;
}

/** Each claim must cite a supplied page and quote it word for word. */
export function checkEvidence(claims: EvidenceClaim[], pages: Array<{ url: string; text: string }>): string[] {
  const byUrl = new Map(pages.map((p) => [p.url, p.text]));
  const issues: string[] = [];
  for (const claim of claims) {
    const text = byUrl.get(claim.url);
    if (text === undefined) issues.push(`${claim.label} cites a URL that was not supplied.`);
    else if (!quoteAppearsIn(claim.quote, text)) issues.push(`${claim.label} quotes text that does not appear on the cited page.`);
  }
  return issues;
}

/** Ids not present in the allowed set. */
export function unknownIds(ids: readonly string[], allowed: readonly string[]): string[] {
  const set = new Set(allowed);
  return ids.filter((id) => !set.has(id));
}

const PROMISE_PATTERNS: Array<[label: string, pattern: RegExp]> = [
  ["a money amount", /(₹|\brs\.?\s?|\binr\s?|\$|€|£)\s?\d/i],
  ["a percentage", /\b\d+(\.\d+)?\s?(%|per\s?cent\b)/i],
  ["a guarantee", /\bguarantee(s|d)?\b/i],
  ["return on investment", /\b(roi|return on investment|payback period)\b/i],
  ["a savings claim", /\b(save|saves|saving|savings|cut|cuts|reduce|reduces|slash|slashes)\b[^.\n]{0,25}\b(cost|costs|money|time|hours|expenses?|spend|spending)\b/i],
  ["a delivery timeframe", /\b(within|in just|in only|in under)\s+\d+\s+(day|days|week|weeks|month|months)\b/i],
  ["a discount", /\b(discount|discounted|free of cost|free trial)\b|%\s*off\b/i],
];

/** Labels of any forbidden commercial promise found in the text. */
export function findPromiseLanguage(text: string): string[] {
  return PROMISE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function checkNoPromises(fields: Record<string, string>): string[] {
  const issues: string[] = [];
  for (const [field, value] of Object.entries(fields)) {
    for (const label of findPromiseLanguage(value)) issues.push(`${field} contains ${label}, which HUNTER does not allow.`);
  }
  return issues;
}

/** First sentence of a text, used by mock fixtures to quote real input honestly. */
export function firstSentence(text: string, maxLength = 200): string {
  const clean = sanitiseUntrusted(text).replace(/\s+/g, " ").trim();
  const match = clean.match(/^.{8,}?[.!?](?=\s|$)/);
  const sentence = match ? match[0] : clean;
  return sentence.slice(0, maxLength).trim();
}
