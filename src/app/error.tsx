"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for every route below the root layout. The message is deliberately generic:
 * the real error is logged server-side (pino) and in the browser console; nothing internal
 * reaches the page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-app-caption text-ink-subtle">
        {error.digest ? `error ${error.digest}` : "error"}
      </p>
      <h1 className="text-app-title text-ink">Something went wrong</h1>
      <p className="text-app-body text-ink-subtle">
        Nothing was changed by this request. Try again; if it keeps happening, the server log has
        the details.
      </p>
      <div className="flex gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
