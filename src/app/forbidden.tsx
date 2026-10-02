import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not allowed" };

/** `forbidden()` (experimental.authInterrupts): signed in, but not an owner. */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-app-caption text-ink-subtle">403</p>
      <h1 className="text-app-title text-ink">This account cannot do that</h1>
      <p className="text-app-body text-ink-subtle">
        Your role does not allow this. Ask an owner for access, or sign in with an account that has
        it.
      </p>
      <Button asChild variant="secondary">
        <Link href="/">Go to the dashboard</Link>
      </Button>
    </main>
  );
}
