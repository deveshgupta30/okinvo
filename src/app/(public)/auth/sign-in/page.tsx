import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { configuredProviders } from "@/lib/auth/providers";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const providers = configuredProviders(env);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-8">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md bg-primary text-app-label font-semibold text-on-primary"
          >
            ok
          </span>
          <span className="text-app-section text-ink">okinvo</span>
        </div>
        <h1 className="text-display-md text-ink">Sign in</h1>
        <p className="mt-2 text-app-body text-ink-subtle">Only allow-listed accounts can enter.</p>
        <div className="mt-6 flex flex-col gap-3">
          {providers.length === 0 ? (
            <p className="rounded-md border border-hairline bg-surface-2 p-4 text-app-caption text-ink-muted">
              No sign-in provider is configured. Set{" "}
              <code className="font-mono">AUTH_GOOGLE_ID</code> /{" "}
              <code className="font-mono">AUTH_GOOGLE_SECRET</code> (or another provider) in{" "}
              <code className="font-mono">.env</code>.
            </p>
          ) : (
            providers.map((p) => (
              <Button
                key={p.id}
                variant="secondary"
                size="lg"
                disabled
                title="Sign-in is wired to Better Auth in M1"
                data-provider={p.id}
              >
                Continue with {p.name}
              </Button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
