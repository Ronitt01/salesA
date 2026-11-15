"use client";

import { useActionState } from "react";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signInAsDemo, type AuthFormState } from "@/server/auth/actions";

const initial: AuthFormState = {};

export function LoginForm({ demoMode, next }: { demoMode: boolean; next: string | null }) {
  const [state, action, pending] = useActionState(signIn, initial);
  const [demoState, demoAction, demoPending] = useActionState(signInAsDemo, initial);
  const error = state.error ?? demoState.error;

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending || demoPending}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          Sign in
        </Button>
      </form>

      {demoMode ? (
        <>
          <div className="flex items-center gap-3 text-xs text-subtle">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <form action={demoAction}>
            <Button type="submit" variant="outline" className="w-full" disabled={pending || demoPending}>
              {demoPending ? <LoaderCircle className="animate-spin" /> : <FlaskConical className="text-warning" />}
              Sign in as demo user
            </Button>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Demo mode is on. The demo workspace contains synthetic companies and contacts only. Nothing in it is real
            research and no message is ever sent.
          </p>
        </>
      ) : null}
    </div>
  );
}
