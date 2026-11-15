import "server-only";

/**
 * HUNTER's AI layer. Server-only: nothing under src/server/ai may be imported by a
 * client component, and API keys never leave this folder.
 *
 * Typical use from a server action:
 *
 *   const ctx = await requireWriter();
 *   const result = await runPrompt(PROMPTS.reply_classifier, input, sessionAiContext(ctx));
 *   if (!result.ok) return { ok: false, error: result.error.message };
 */
export { runPrompt, type AiContext, type AiExecutionRecord, type AiResult, type AiRunMeta, type ExecutionRecorder } from "./run";
export { sessionAiContext, supabaseRecorder, systemAiContext } from "./recorder";
export { loadAiConfig, createProvider, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL, type AiConfig } from "./config";
export { AiError, type AiErrorKind } from "./errors";
export { PROMPTS, PROMPT_LIST, detectOptOutLanguage, type PromptId } from "./prompts";
export type { LlmProvider, LlmRequest, LlmResponse, LlmUsage } from "./types";
