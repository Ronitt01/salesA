import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/server/auth/context";
import type { Database, Json } from "@/server/db/database.types";
import type { AiContext, ExecutionRecorder } from "./run";

/**
 * Records executions in ai_executions through the given client.
 *
 * With a user's RLS-bound client, Row Level Security guarantees the row lands in that
 * user's own workspace. Workflows without a session pass the service-role client and
 * must supply the tenant themselves.
 */
export function supabaseRecorder(client: SupabaseClient<Database>): ExecutionRecorder {
  return async (record) => {
    const { data, error } = await client
      .from("ai_executions")
      .insert({
        tenant_id: record.tenantId,
        prompt_id: record.promptId,
        prompt_version: record.promptVersion,
        provider: record.provider,
        model: record.model,
        status: record.status,
        error_kind: record.errorKind,
        error_message: record.errorMessage,
        attempts: record.attempts,
        duration_ms: record.durationMs,
        input_tokens: record.usage?.inputTokens ?? null,
        output_tokens: record.usage?.outputTokens ?? null,
        cache_read_input_tokens: record.usage?.cacheReadInputTokens ?? null,
        cache_creation_input_tokens: record.usage?.cacheCreationInputTokens ?? null,
        input_chars: record.inputChars,
        injection_signals: record.injectionSignals,
        synthetic: record.synthetic,
        entity_type: record.entityType,
        entity_id: record.entityId,
        actor_type: record.actorType,
        actor_user_id: record.actorUserId,
        provider_request_id: record.providerRequestId,
        output: (record.output ?? null) as Json,
        raw_excerpt: record.rawExcerpt,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Could not record AI execution: ${error.message}`);
    return data.id;
  };
}

/** AI context for work done on behalf of the signed-in user. */
export function sessionAiContext(ctx: SessionContext, entity?: AiContext["entity"]): AiContext {
  return {
    tenantId: ctx.tenantId,
    actorType: "user",
    actorUserId: ctx.user.id,
    recorder: supabaseRecorder(ctx.supabase),
    entity,
  };
}

/** AI context for scheduled or webhook-driven work, recorded with the service-role client. */
export function systemAiContext(
  admin: SupabaseClient<Database>,
  tenantId: string,
  actorType: "system" | "workflow" = "workflow",
  entity?: AiContext["entity"],
): AiContext {
  return { tenantId, actorType, actorUserId: null, recorder: supabaseRecorder(admin), entity };
}
