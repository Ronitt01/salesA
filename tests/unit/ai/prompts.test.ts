import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PROMPTS, PROMPT_LIST, SECURITY_PREAMBLE, buildSystemPrompt, detectOptOutLanguage, type AnyPrompt } from "@/server/ai/prompts";
import { lockKey, promptFingerprint } from "@/server/ai/prompts/fingerprint";

const lock: Record<string, string> = JSON.parse(readFileSync("src/server/ai/prompts/prompt-lock.json", "utf8"));
const cases = PROMPT_LIST.map((p) => [p.id, p] as const);

/** Every property name anywhere in a JSON schema. */
function propertyNames(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => propertyNames(s, out));
  else if (schema && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && value && typeof value === "object") Object.keys(value).forEach((k) => out.add(k.toLowerCase()));
      propertyNames(value, out);
    }
  }
  return out;
}

function blockRanges(text: string): Array<[number, number]> {
  return [...text.matchAll(/<untrusted_document\b[^>]*>[\s\S]*?<\/untrusted_document>/g)].map((m) => [m.index, m.index + m[0].length]);
}

describe("prompt registry", () => {
  it("registers the six planned prompts", () => {
    expect(Object.keys(PROMPTS).sort()).toEqual(
      ["buying_signal_detector", "company_researcher", "lead_qualifier", "opportunity_strategist", "reply_classifier", "sales_message_generator"].sort(),
    );
    for (const [key, prompt] of Object.entries(PROMPTS)) expect(prompt.id).toBe(key);
  });

  it.each(cases)("%s has a semantic version and a lock entry that matches its content", (_id, prompt) => {
    expect(prompt.version).toMatch(/^\d+\.\d+\.\d+$/);
    const key = lockKey(prompt);
    expect(lock[key], `${key} is missing from prompt-lock.json; run npm run ai:lock`).toBeDefined();
    expect(promptFingerprint(prompt), `${key} changed without a version bump`).toBe(lock[key]);
  });

  it("detects a change made without a version bump", () => {
    const edited: AnyPrompt = { ...PROMPTS.reply_classifier, system: `${PROMPTS.reply_classifier.system} Be brief.` };
    expect(promptFingerprint(edited)).not.toBe(lock[lockKey(edited)]);
  });
});

describe("prompt content", () => {
  it.each(cases)("%s starts its system prompt with the shared security rules", (_id, prompt) => {
    expect(buildSystemPrompt(prompt).startsWith(SECURITY_PREAMBLE)).toBe(true);
  });

  it.each(cases)("%s keeps untrusted text out of the system prompt and inside untrusted blocks", (_id, prompt) => {
    const input = prompt.inputSchema.parse(prompt.example);
    const user = prompt.buildUser(input);
    const system = buildSystemPrompt(prompt);
    const ranges = blockRanges(user);
    for (const text of prompt.untrustedText(input) as string[]) {
      if (text.length < 40) continue; // short values are rendered inline after sanitising
      expect(system).not.toContain(text);
      const at = user.indexOf(text.trim().split("\n")[0]);
      expect(at, "untrusted text should appear in the user turn").toBeGreaterThan(-1);
      expect(ranges.some(([start, end]) => at > start && at < end), "untrusted text must sit inside an untrusted_document block").toBe(true);
    }
  });

  it.each(cases)("%s output schema has no score, priority or qualification field", (_id, prompt) => {
    const names = propertyNames(z.toJSONSchema(prompt.outputSchema, { unrepresentable: "any" }));
    for (const forbidden of ["score", "opportunityscore", "totalscore", "priority", "qualified", "isqualified", "approved", "shouldcontact", "send"]) {
      expect(names.has(forbidden), `${forbidden} must not be an output field`).toBe(false);
    }
  });
});

describe("mock fixtures", () => {
  it.each(cases)("%s fixture is schema-valid, passes its guards and is labelled synthetic", (_id, prompt) => {
    const input = prompt.inputSchema.parse(prompt.example);
    const output = prompt.mockFixture(input);
    expect(prompt.outputSchema.safeParse(output).success).toBe(true);
    expect(prompt.guard(output, input)).toEqual([]);
    expect(JSON.stringify(output)).toMatch(/synthetic/i);
  });

  it.each(cases)("%s fixture never claims to have browsed, searched or contacted anyone", (_id, prompt) => {
    const text = JSON.stringify(prompt.mockFixture(prompt.inputSchema.parse(prompt.example)));
    expect(text).not.toMatch(/\b(i (visited|browsed|searched|checked|called|spoke)|we (visited|browsed|searched)|according to (google|linkedin))\b/i);
  });

  it.each(cases)("%s strict schema rejects unknown fields", (_id, prompt) => {
    const output = prompt.mockFixture(prompt.inputSchema.parse(prompt.example)) as Record<string, unknown>;
    expect(prompt.outputSchema.safeParse({ ...output, injected: true }).success).toBe(false);
  });

  it("company researcher mock quotes only text that is really on the supplied pages", () => {
    const prompt = PROMPTS.company_researcher;
    const output = prompt.mockFixture(prompt.example);
    expect(output.observedFacts.length).toBeGreaterThan(0);
    for (const fact of output.observedFacts) {
      const page = prompt.example.pages.find((p) => p.url === fact.evidenceUrl);
      expect(page?.text).toContain(fact.evidenceQuote);
    }
  });

  it("buying signal mock detects the example's hiring and dealer signals", () => {
    const output = PROMPTS.buying_signal_detector.mockFixture(PROMPTS.buying_signal_detector.example);
    expect(output.signals.map((s) => s.signalType).sort()).toEqual(["distribution_expansion", "hiring_operations"]);
  });

  it("reply classifier mock and the opt-out detector catch opt-outs in many wordings", () => {
    for (const text of ["Please unsubscribe me.", "Stop emailing me", "Do not contact us again", "Remove me from your list", "opt-out"]) {
      expect(detectOptOutLanguage(text), text).toBe(true);
      const output = PROMPTS.reply_classifier.mockFixture({ latestMessage: { text }, priorMessages: [] });
      expect(output).toMatchObject({ intent: "unsubscribe", optOutRequested: true });
    }
    expect(detectOptOutLanguage("Thanks, can we speak on Monday?")).toBe(false);
  });
});
