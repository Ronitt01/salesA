/**
 * Runs one prompt through the configured provider and prints the outcome.
 *
 *   npm run ai:smoke                      # reply_classifier with its synthetic example
 *   npm run ai:smoke -- company_researcher
 *
 * With LLM_PROVIDER=anthropic this makes ONE real API call, billed to your Anthropic
 * account. The input is the prompt's built-in synthetic example (fictional company,
 * .example domains); no workspace data is sent. The execution is recorded against the
 * local demo workspace, so it refuses to run against a non-local database.
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

async function main() {
  const promptId = (process.argv[2] ?? "reply_classifier") as PromptId;
  const prompt: AnyPrompt | undefined = PROMPTS[promptId];
  if (!prompt) throw new Error(`Unknown prompt "${promptId}". Choose one of: ${Object.keys(PROMPTS).join(", ")}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error(`Refusing to record into a non-local database (${url}).`);

  const settings = loadAiConfig();
  console.log(`Provider: ${settings.provider}  Model: ${settings.model}  Prompt: ${prompt.id}@${prompt.version}`);
  if (settings.provider === "anthropic") console.log("This makes one real, billed API call with synthetic input.");

  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const workspace = await admin.from("workspaces").select("id").eq("slug", "demo-agency").single();
  if (workspace.error) throw new Error("The demo workspace is missing. Run npm run db:seed first.");

  const result = await runPrompt(prompt, prompt.example, systemAiContext(admin, workspace.data.id, "system"));
  console.log(JSON.stringify({ ok: result.ok, meta: result.meta, ...(result.ok ? { data: result.data } : { error: result.error }) }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
