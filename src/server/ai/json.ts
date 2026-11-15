import { AiError } from "./errors";

/**
 * Extracts one JSON value from model text. Structured output normally returns bare
 * JSON; this also tolerates a fenced code block or a short preamble, and fails with
 * invalid_json otherwise.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") throw new AiError("invalid_json", "The model returned an empty response.", { rawText: text });

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidates = [fenced ? fenced[1] : trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start > 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  throw new AiError("invalid_json", "The model response was not valid JSON.", { rawText: text });
}
