"use client";

import { useEffect } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: string }).digest) : null;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center">
        <CircleAlert className="mx-auto size-7 text-danger" />
        <h1 className="mt-3 text-base font-semibold">This page could not be loaded</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The request failed before the page finished loading. Your data has not been changed. If the database was
          restarted, wait a moment and try again.
        </p>
        {digest ? <p className="mt-2 font-mono text-xs text-subtle">Reference: {digest}</p> : null}
        <Button className="mt-4" variant="outline" onClick={() => retry()}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    </div>
  );
}
