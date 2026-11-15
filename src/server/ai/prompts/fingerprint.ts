import { createHash } from "node:crypto";
import { z } from "zod";
import type { AnyPrompt } from "./index";
import { buildSystemPrompt } from "./shared";

/**
 * A fingerprint of everything that defines a prompt's behaviour: the full system
 * prompt, the user turn rendered from the prompt's example input, both schemas, and
 * the model settings. prompt-lock.json maps id@version to this value, so a prompt
 * cannot change without its version changing.
 */
export function promptFingerprint(prompt: AnyPrompt): string {
  const material = JSON.stringify({
    system: buildSystemPrompt(prompt),
    user: prompt.buildUser(prompt.inputSchema.parse(prompt.example)),
    input: z.toJSONSchema(prompt.inputSchema, { io: "input", unrepresentable: "any" }),
    output: z.toJSONSchema(prompt.outputSchema, { unrepresentable: "any" }),
    maxTokens: prompt.maxTokens,
    effort: prompt.effort,
  });
  return createHash("sha256").update(material).digest("hex");
}

export function lockKey(prompt: Pick<AnyPrompt, "id" | "version">): string {
  return `${prompt.id}@${prompt.version}`;
}
