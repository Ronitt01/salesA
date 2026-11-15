/**
 * Adds new prompt versions to src/server/ai/prompts/prompt-lock.json.
 *
 *   npm run ai:lock
 *
 * The lock is append-only. A new id@version is added; an existing id@version whose
 * fingerprint has changed is an error, because it means a prompt was edited without
 * bumping its version. Bump the version in the prompt file, add a changelog line,
 * then run this again.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PROMPT_LIST } from "../src/server/ai/prompts";
import { lockKey, promptFingerprint } from "../src/server/ai/prompts/fingerprint";

const LOCK_PATH = "src/server/ai/prompts/prompt-lock.json";

const lock: Record<string, string> = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, "utf8")) : {};
const added: string[] = [];
const changed: string[] = [];

for (const prompt of PROMPT_LIST) {
  const key = lockKey(prompt);
  const fingerprint = promptFingerprint(prompt);
  if (!(key in lock)) {
    lock[key] = fingerprint;
    added.push(key);
  } else if (lock[key] !== fingerprint) {
    changed.push(key);
  }
}

if (changed.length > 0) {
  console.error("These prompts changed without a version bump:");
  for (const key of changed) console.error(`  - ${key}`);
  console.error("Bump each prompt's version, add a changelog line, and run npm run ai:lock again.");
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(LOCK_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(added.length > 0 ? `Added ${added.join(", ")}.` : "Prompt lock is up to date.");
