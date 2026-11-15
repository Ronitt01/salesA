/**
 * Creates (or reuses) the demo user and workspace, then loads the synthetic dataset.
 *
 *   npm run db:seed
 *
 * Refuses to run against anything but a local Supabase URL unless
 * HUNTER_ALLOW_REMOTE_SEED=true is set, so it cannot touch production by accident.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/server/db/database.types";
import { seedDemoData } from "../src/server/demo/seed";

config({ path: ".env.local" });
config({ path: ".env" });

const WORKSPACE_SLUG = "demo-agency";
const WORKSPACE_NAME = "Demo Agency";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;

  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  if (!email || !password) throw new Error("DEMO_USER_EMAIL and DEMO_USER_PASSWORD must be set in .env.local");

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
  if (!isLocal && process.env.HUNTER_ALLOW_REMOTE_SEED !== "true") {
    throw new Error(`Refusing to seed demo data into a non-local database (${url}). Set HUNTER_ALLOW_REMOTE_SEED=true to override.`);
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Demo user
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Demo User" },
  });
  if (created.data.user) {
    userId = created.data.user.id;
    console.log(`Created demo user ${email}`);
  } else {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw new Error(`Could not list users: ${list.error.message}`);
    const existing = list.data.users.find((u) => u.email === email);
    if (!existing) throw new Error(`Could not create demo user: ${created.error?.message ?? "unknown error"}`);
    userId = existing.id;
    const updated = await admin.auth.admin.updateUserById(userId, { password });
    if (updated.error) throw new Error(`Could not update demo user password: ${updated.error.message}`);
    console.log(`Reusing demo user ${email}`);
  }

  // Profile row normally arrives through the auth trigger; make sure of it.
  const profile = await admin.from("users").upsert({ id: userId, email, full_name: "Demo User" }, { onConflict: "id" });
  if (profile.error) throw new Error(`Could not upsert profile: ${profile.error.message}`);

  // Workspace
  const workspace = await admin
    .from("workspaces")
    .upsert({ slug: WORKSPACE_SLUG, name: WORKSPACE_NAME }, { onConflict: "slug" })
    .select("id")
    .single();
  if (workspace.error) throw new Error(`Could not upsert workspace: ${workspace.error.message}`);
  const tenantId = workspace.data.id;

  const membership = await admin
    .from("memberships")
    .upsert({ tenant_id: tenantId, user_id: userId, role: "owner" }, { onConflict: "tenant_id,user_id" });
  if (membership.error) throw new Error(`Could not upsert membership: ${membership.error.message}`);

  const summary = await seedDemoData(admin, tenantId, userId);
  console.log("Synthetic demo data loaded:");
  console.table(summary);
  if (summary.demotedCount > 0) {
    console.log(`Note: ${summary.demotedCount} planned-qualified companies were not qualified by the scoring engine and were kept at "verified".`);
  }
  console.log(`\nSign in at http://localhost:3000/login with ${email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
