import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Secrets are read only here and never re-exported to
 * client components. Anything the browser may see is prefixed NEXT_PUBLIC_.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "NEXT_PUBLIC_SUPABASE_URL is required"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  NEXT_PUBLIC_DEMO_MODE: z.enum(["true", "false"]).default("false"),
  DEMO_USER_EMAIL: z.string().optional(),
  DEMO_USER_PASSWORD: z.string().optional(),

  LLM_PROVIDER: z.enum(["mock", "anthropic", "openai"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),

  // Live sending stays off unless this is explicitly "true" AND the compliance gate passes.
  OUTBOUND_LIVE_SENDING: z.enum(["true", "false"]).default("false"),

  N8N_BASE_URL: z.string().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),

  APP_URL: z.string().default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration: ${issues.join("; ")}`);
    this.name = "EnvError";
  }
}

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  cached = parsed.data;
  return cached;
}

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
