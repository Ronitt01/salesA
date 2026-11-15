import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";
import { getSessionContext } from "@/server/auth/context";
import { getShellNotifications, getShellStatus } from "@/server/repositories/shell";

/**
 * Authenticated area. The layout itself awaits nothing, so Next.js can prerender
 * the skeleton as the static shell; the session is resolved inside the boundary.
 */
async function ShellWithSession({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  const now = new Date();
  const notifications = await getShellNotifications(ctx, now);

  return (
    <AppShell
      user={{ email: ctx.user.email, fullName: ctx.user.fullName }}
      workspace={{ name: ctx.workspace.name }}
      role={ctx.role}
      hasDemoData={ctx.workspace.has_demo_data}
      status={getShellStatus(ctx)}
      notifications={notifications}
      renderedAt={now.toISOString()}
    >
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ShellWithSession>{children}</ShellWithSession>
    </Suspense>
  );
}
