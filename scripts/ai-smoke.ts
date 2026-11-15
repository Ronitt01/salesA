/**
 * Runs one prompt through an AI provider and prints the outcome.
 *
 *   npm run ai:smoke                                   # configured provider, reply_classifier
 *   npm run ai:smoke -- company_researcher             # another prompt
 *   npm run ai:smoke -- --provider=gemini              # force a provider for this run
 *   npm run ai:smoke:gemini                            # same as --provider=gemini
 *
 * With a real provider this makes ONE real API call, billed to that provider account.
 * The input is the prompt's built-in synthetic example (fictional company, .example
 * domains); no workspace data is sent. The execution is recorded against the local
 * demo workspace, so it refuses to run against a non-local database.
 *
 * --provider changes only this run. The key must still come from .env.local, and a
 * missing key is an error: the script never substitutes another provider.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/server/db/database.types";
import { loadAiConfig } from "../src/server/ai/config";
import { PROMPTS, type AnyPrompt, type PromptId } from "../src/server/ai/prompts";
import { systemAiContext } from "../src/server/ai/recorder";
import { runPrompt } from "../src/server/ai/run";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

function parseArgs(argv: string[]): { promptId: string; provider: string | null } {
  let provider: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--provider=")) provider = arg.slice("--provider=".length);
    else if (arg === "--provider") provider = argv[++i] ?? null;
    else positional.push(arg);
  }
  return { promptId: positional[0] ?? "reply_classifier", provider };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompt: AnyPrompt | undefined = PROMPTS[args.promptId as PromptId];
  if (!prompt) throw new Error(`Unknown prompt "${args.promptId}". Choose one of: ${Object.keys(PROMPTS).join(", ")}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error(`Refusing to record into a non-local database (${url}).`);

  const settings = loadAiConfig(args.provider ? { ...process.env, LLM_PROVIDER: args.provider } : process.env);
  console.log(`Provider: ${settings.provider}  Model: ${settings.model}  Prompt: ${prompt.id}@${prompt.version}`);
  if (settings.provider !== "mock") console.log("This makes one real, billed API call with synthetic input.");

  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const workspace = await admin.from("workspaces").select("id").eq("slug", "demo-agency").single();
  if (workspace.error) throw new Error("The demo workspace is missing. Run npm run db:seed first.");

  const result = await runPrompt(prompt, prompt.example, systemAiContext(admin, workspace.data.id, "system"), { config: settings });
  console.log(JSON.stringify({ ok: result.ok, meta: result.meta, ...(result.ok ? { data: result.data } : { error: result.error }) }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
