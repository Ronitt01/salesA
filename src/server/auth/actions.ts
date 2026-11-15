"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/server/db/server";
import { isDemoMode } from "@/server/env";

export interface AuthFormState {
  error?: string;
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

function safeNext(value: FormDataEntryValue | null): string {
  // Only same-site relative paths are accepted as a post-login destination.
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/overview";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };

  let failed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    failed = Boolean(error);
  } catch {
    return { error: "The authentication service is not reachable. Check that Supabase is running." };
  }
  // One message for every credential failure, so the form does not reveal which accounts exist.
  if (failed) return { error: "Incorrect email or password." };

  redirect(safeNext(formData.get("next")));
}

export async function signInAsDemo(_prev: AuthFormState, _formData: FormData): Promise<AuthFormState> {
  void _formData;
  if (!isDemoMode()) return { error: "Demo sign-in is disabled." };
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return { error: "Demo credentials are not configured. Set DEMO_USER_EMAIL and DEMO_USER_PASSWORD, then run npm run db:seed." };
  }

  let failed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    failed = Boolean(error);
  } catch {
    return { error: "The authentication service is not reachable. Check that Supabase is running." };
  }
  if (failed) return { error: "The demo user does not exist yet. Run npm run db:seed to create it." };

  redirect("/overview");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
