/**
 * Hunter.io smoke test for all three endpoints. Writes nothing to the database.
 *
 *   npm run hunter:smoke                 # Hunter's public test credential: free, fixed dummy data
 *   npm run hunter:smoke:live            # HUNTER_API_KEY from .env.local: real, billed calls
 *   npm run hunter:smoke:live -- --domain=example-company.com
 *
 * Live mode makes one Domain Search (limit 1), one Email Finder for the person that
 * search returned, and one Email Verifier for the address found. It prints the
 * account's remaining credits before and after. It never prints the API key, never
 * prints people's names, and masks every email address.
 */
import { config } from "dotenv";
import { HUNTER_TEST_API_KEY, HunterClient, HunterError } from "../src/server/providers/hunter/client";
import { maskEmail } from "../src/server/services/enrichment/merge";
import { mapHunterVerification } from "../src/server/services/enrichment/verification";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const args = process.argv.slice(2);
const live = args.includes("--live");
const domainArg = args.find((a) => a.startsWith("--domain="))?.slice("--domain=".length);

type Row = { step: string; ok: boolean; detail: string };
const rows: Row[] = [];

async function step<T>(name: string, run: () => Promise<T>, describe: (value: T) => string): Promise<T | null> {
  try {
    const value = await run();
    rows.push({ step: name, ok: true, detail: describe(value) });
    return value;
  } catch (error) {
    const detail = error instanceof HunterError ? `${error.kind}: ${error.message}` : error instanceof Error ? error.message : String(error);
    rows.push({ step: name, ok: false, detail });
    return null;
  }
}

function credits(meta: { credits: { used: number | null; unit: string | null }; attempts: number; durationMs: number }): string {
  const used = meta.credits.used === null ? "credits not reported" : `${meta.credits.used} ${meta.credits.unit ?? "credit"} used`;
  return `${used}, ${meta.attempts} attempt(s), ${meta.durationMs} ms`;
}

async function main() {
  let apiKey = HUNTER_TEST_API_KEY;
  if (live) {
    const configured = process.env.HUNTER_API_KEY?.trim();
    if (!configured) throw new Error("HUNTER_API_KEY is not set in .env.local. Live mode needs a real key.");
    if (configured === HUNTER_TEST_API_KEY) throw new Error("HUNTER_API_KEY is the test key. Run npm run hunter:smoke for test mode.");
    apiKey = configured;
  }
  const domain = domainArg ?? (live ? "hunter.io" : "stripe.com");
  const client = new HunterClient({ apiKey });
  console.log(`Mode: ${live ? "LIVE (real, billed calls)" : "test credential (free, dummy data)"}  Domain: ${domain}`);

  if (live) {
    await step("Account (before)", () => client.account(), (r) => {
      const req = r.data.data.requests;
      return `plan ${r.data.data.plan_name ?? "?"}; searches ${req?.searches?.used ?? "?"}/${req?.searches?.available ?? "?"}, verifications ${req?.verifications?.used ?? "?"}/${req?.verifications?.available ?? "?"}, credits ${req?.credits?.used ?? "?"}/${req?.credits?.available ?? "?"}`;
    });
  }

  const search = await step(
    "Domain Search",
    () => client.domainSearch({ domain, limit: live ? 1 : 10 }),
    (r) => {
      const first = r.data.data.emails[0];
      return `${r.data.data.emails.length} address(es) returned for ${r.data.data.domain}${first ? `; first: ${maskEmail(first.value)}, confidence ${first.confidence ?? "?"}, has name: ${Boolean(first.first_name && first.last_name)}, Hunter status: ${first.verification?.status ?? "none"}` : ""}; ${credits(r.meta)}`;
    },
  );

  const person = search?.data.data.emails.find((e) => e.first_name && e.last_name) ?? null;
  const finder = person
    ? await step(
        "Email Finder",
        () => client.emailFinder({ domain, firstName: person.first_name as string, lastName: person.last_name as string }),
        (r) => `${r.data.data.email ? `found ${maskEmail(r.data.data.email)}, score ${r.data.data.score ?? "?"}` : "no address found"}; ${credits(r.meta)}`,
      )
    : (rows.push({ step: "Email Finder", ok: false, detail: "Skipped: the Domain Search returned no person with a name." }), null);

  const toVerify = finder?.data.data.email ?? person?.value ?? null;
  if (toVerify) {
    await step(
      "Email Verifier",
      () => client.emailVerifier({ email: toVerify }),
      (r) =>
        `Hunter status "${r.data.data.status}" -> HUNTER ${mapHunterVerification(r.data.data.status)}, score ${r.data.data.score ?? "?"}, smtp_check ${r.data.data.smtp_check}, accept_all ${r.data.data.accept_all}; ${credits(r.meta)}`,
    );
  } else {
    rows.push({ step: "Email Verifier", ok: false, detail: "Skipped: no address to verify." });
  }

  if (live) {
    await step("Account (after)", () => client.account(), (r) => {
      const req = r.data.data.requests;
      return `searches ${req?.searches?.used ?? "?"}/${req?.searches?.available ?? "?"}, verifications ${req?.verifications?.used ?? "?"}/${req?.verifications?.available ?? "?"}, credits ${req?.credits?.used ?? "?"}/${req?.credits?.available ?? "?"}`;
    });
  }

  for (const row of rows) console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.step.padEnd(18)} ${row.detail}`);
  const required = rows.filter((r) => ["Domain Search", "Email Finder", "Email Verifier"].includes(r.step));
  const passed = required.filter((r) => r.ok).length;
  console.log(`\n${passed}/3 endpoints passed.`);
  if (passed < 3) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
