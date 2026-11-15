import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  // These tests create and delete tenants. They must never run against a hosted database.
  throw new Error(`Integration tests only run against a local Supabase stack. NEXT_PUBLIC_SUPABASE_URL is "${url}".`);
}
