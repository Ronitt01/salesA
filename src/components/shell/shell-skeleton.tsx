import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** Static shell shown while the session resolves. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden h-dvh w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <div className="h-14 border-b border-sidebar-border" />
        <div className="space-y-2 p-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-14 border-b" />
        <div className="px-3 py-5 sm:px-5 lg:px-8 lg:py-7">
          <PageSkeleton />
        </div>
      </div>
    </div>
  );
}
