import "server-only";
import { logger } from "@/server/logger";
import type { SessionContext } from "@/server/auth/context";
import type { Json } from "@/server/db/database.types";

/**
 * Appends to the audit log. Every consequential action calls this.
 * A failure to audit is surfaced, not swallowed: an unaudited change is a defect.
 */
export async function writeAudit(
  ctx: SessionContext,
  action: string,
  entityType: string,
  entityId: string | null,
  detail: Record<string, Json | undefined> = {},
): Promise<void> {
  const { error } = await ctx.supabase.from("audit_logs").insert({
    tenant_id: ctx.tenantId,
    actor_type: "user",
    actor_user_id: ctx.user.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail: detail as { [key: string]: Json | undefined },
  });
  if (error) throw new Error(`Audit log write failed for ${action}: ${error.message}`);
}

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export function actionError(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof Error && (error.name === "ForbiddenError" || error.name === "RescoreError")) {
    return { ok: false, error: error.message };
  }
  logger.error("action", fallback, { cause: error instanceof Error ? error.message : String(error) });
  return { ok: false, error: fallback };
}
