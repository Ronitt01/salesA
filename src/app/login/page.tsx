import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { HunterMark } from "@/components/shell/hunter-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Checks the auth service at request time so setup problems are visible, not silent. */
async function BackendStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return (
      <StatusLine ok={false}>
        Supabase is not configured. Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env.local</code> and fill in the Supabase values.
      </StatusLine>
    );
  }

  let ok = false;
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(3000),
    });
    ok = response.ok;
  } catch {
    ok = false;
  }

  return ok ? (
    <StatusLine ok>Backend connected</StatusLine>
  ) : (
    <StatusLine ok={false}>
      Cannot reach Supabase at <code className="font-mono">{url}</code>. Start Docker Desktop, then run{" "}
      <code className="font-mono">npm run db:start</code>.
    </StatusLine>
  );
}

function StatusLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 text-xs leading-relaxed ${ok ? "text-muted-foreground" : "text-warning"}`}>
      {ok ? <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-3.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

async function Form({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  const reason = typeof params.reason === "string" ? params.reason : null;
  return (
    <>
      {reason === "no-workspace" ? (
        <p role="alert" className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Your account is not a member of any workspace yet. Ask a workspace owner to add you.
        </p>
      ) : null}
      <LoginForm demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === "true"} next={next} />
    </>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <HunterMark className="size-9" />
          <div>
            <p className="text-lg font-semibold tracking-tight">HUNTER</p>
            <p className="text-xs text-muted-foreground">Revenue intelligence and client acquisition</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-base font-semibold">Sign in to your workspace</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Use the email and password for your HUNTER account.</p>
          <Suspense fallback={<div className="h-56 animate-pulse rounded-md bg-muted" />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </div>

        <div className="mt-4 min-h-5 px-1">
          <Suspense fallback={<p className="text-xs text-subtle">Checking backend…</p>}>
            <BackendStatus />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
