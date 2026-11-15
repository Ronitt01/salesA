import "server-only";
import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { getEnv } from "@/server/env";

/**
 * Supabase client bound to the signed-in user's session cookies.
 * Every query made through it is subject to Row Level Security.
 */
export async function createClient() {
  const env = getEnv();
  const cookieStore = await cookies();
  // The Supabase auth client reads the clock (token expiry) as soon as it is used.
  // io() tells Next.js that everything after this point is request-time work, so it
  // is never evaluated while prerendering the static shell.
  await io();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

export type UserClient = Awaited<ReturnType<typeof createClient>>;
