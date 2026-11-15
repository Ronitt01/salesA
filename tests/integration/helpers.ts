import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/database.types";
import { bootstrapWorkspace } from "@/server/demo/bootstrap";

export type Client = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["member_role"];

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

export function adminClient(): Client {
  return createClient<Database>(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient(): Client {
  return createClient<Database>(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TestTenant {
  tenantId: string;
  slug: string;
  users: Record<string, { id: string; email: string; client: Client }>;
}

const PASSWORD = "integration-test-password";

/** Creates an isolated workspace with one signed-in client per requested role. */
export async function createTenant(admin: Client, label: string, roles: Role[]): Promise<TestTenant> {
  const suffix = randomUUID().slice(0, 8);
  const slug = `it-${label}-${suffix}`;
  const workspace = await admin.from("workspaces").insert({ slug, name: `Integration ${label}` }).select("id").single();
  if (workspace.error) throw workspace.error;
  const tenantId = workspace.data.id;
  await bootstrapWorkspace(admin, tenantId);

  const users: TestTenant["users"] = {};
  for (const role of roles) {
    const email = `${role}-${suffix}@integration.test`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("user not created");
    const id = created.data.user.id;
    const profile = await admin.from("users").upsert({ id, email }, { onConflict: "id" });
    if (profile.error) throw profile.error;
    const membership = await admin.from("memberships").insert({ tenant_id: tenantId, user_id: id, role });
    if (membership.error) throw membership.error;

    const client = anonClient();
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error) throw signedIn.error;
    users[role] = { id, email, client };
  }
  return { tenantId, slug, users };
}

/** Removes the workspace (cascading to all its data) and its users. */
export async function destroyTenant(admin: Client, tenant: TestTenant | undefined): Promise<void> {
  if (!tenant) return;
  await admin.from("workspaces").delete().eq("id", tenant.tenantId);
  for (const user of Object.values(tenant.users)) await admin.auth.admin.deleteUser(user.id);
}

export async function insertCompany(client: Client, tenantId: string, name: string, domain: string | null = null) {
  return client.from("companies").insert({ tenant_id: tenantId, name, domain }).select("id, normalised_domain").single();
}
