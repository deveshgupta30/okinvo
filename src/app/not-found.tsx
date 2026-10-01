import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/** Unknown URL outside the signed-in shell (the shell has its own not-found inside the layout). */
export default function RootNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-app-caption text-ink-subtle">404</p>
      <h1 className="text-app-title text-ink">There is nothing at this address</h1>
      <p className="text-app-body text-ink-subtle">
        The link may be stale, or the document it pointed to was never issued.
      </p>
      <Button asChild variant="secondary">
        <Link href="/">Go to the dashboard</Link>
      </Button>
    </main>
  );
}
