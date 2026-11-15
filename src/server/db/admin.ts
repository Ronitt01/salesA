import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type AdminClient = SupabaseClient<Database>;

/**
 * Service-role client. It BYPASSES Row Level Security.
 *
 * Use only for trusted server work that has no user session: seeding, signed
 * webhook ingestion and the workflow runner. Callers must scope every query by
 * tenant_id themselves. Never import this from a client component; the
 * `server-only` import makes that a build error.
 */
export function createAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set for server-side administrative work.",
    );
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
