/**
 * Fails if any server-only secret appears in the files shipped to the browser.
 *
 *   npm run build && npm run check:bundle
 *
 * It reads every non-NEXT_PUBLIC value from .env.local / .env and searches the
 * client output (.next/static) for it. Values shorter than 8 characters and plain
 * booleans are skipped because they would match by coincidence.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next", "static");
const SKIP_VALUES = new Set(["true", "false", "mock", "anthropic", "openai"]);

function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

if (!existsSync(STATIC_DIR)) {
  console.error("No .next/static directory. Run `npm run build` first.");
  process.exit(2);
}

const env = { ...readEnv(".env"), ...readEnv(".env.local") };
const secrets = Object.entries(env).filter(
  ([key, value]) => !key.startsWith("NEXT_PUBLIC_") && value.length >= 8 && !SKIP_VALUES.has(value) && !/^https?:\/\//.test(value),
);
// Names that must never be referenced from client code, whatever their value.
const forbiddenNames = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "N8N_WEBHOOK_SECRET", "DEMO_USER_PASSWORD"];

let files = 0;
const leaks = [];
for (const file of walk(STATIC_DIR)) {
  if (!/\.(js|css|json|html|txt|map)$/.test(file)) continue;
  files++;
  const content = readFileSync(file, "utf8");
  for (const [key, value] of secrets) {
    if (content.includes(value)) leaks.push(`${key} value found in ${file}`);
  }
  for (const name of forbiddenNames) {
    if (content.includes(name)) leaks.push(`reference to ${name} found in ${file}`);
  }
}

console.log(`Scanned ${files} client files for ${secrets.length} secret values and ${forbiddenNames.length} forbidden names.`);
if (leaks.length > 0) {
  console.error("Secrets exposed to the browser:");
  for (const leak of leaks) console.error(`  - ${leak}`);
  process.exit(1);
}
console.log("No server secrets found in the client bundle.");
