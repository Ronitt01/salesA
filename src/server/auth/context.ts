import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, type UserClient } from "@/server/db/server";
import type { Database } from "@/server/db/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];
export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

export interface SessionContext {
  /** RLS-bound client for the signed-in user. */
  supabase: UserClient;
  user: { id: string; email: string; fullName: string | null };
  workspace: Workspace;
  tenantId: string;
  role: MemberRole;
}

/**
 * The single entry point for "who is asking, and for which workspace".
 *
 * Every page, server action and route handler that touches tenant data calls this
 * first. It is wrapped in React `cache`, so one render pass resolves it once.
 * Note that `cache` does not span server actions or route handlers; those resolve
 * it again, which is the intended re-verification.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) redirect("/login");
  const authUser = userData.user;

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role, tenant_id, workspaces(*)")
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not load workspace membership: ${error.message}`);
  if (!membership || !membership.workspaces) redirect("/login?reason=no-workspace");

  return {
    supabase,
    user: {
      id: authUser.id,
      email: authUser.email ?? "",
      fullName: (authUser.user_metadata?.full_name as string | undefined) ?? null,
    },
    workspace: membership.workspaces,
    tenantId: membership.tenant_id,
    role: membership.role,
  };
});

export function canWrite(role: MemberRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function isAdmin(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Use at the top of server actions that change working data. */
export async function requireWriter(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!canWrite(ctx.role)) throw new ForbiddenError("Viewers cannot make changes.");
  return ctx;
}

/** Use at the top of server actions that change configuration. */
export async function requireAdmin(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!isAdmin(ctx.role)) throw new ForbiddenError("Only workspace owners and admins can change this.");
  return ctx;
}
