import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/logo";
import { PasswordSignInForm } from "@/components/password-sign-in-form";
import { SignInButtons } from "@/components/sign-in-buttons";
import { configuredProviders } from "@/lib/auth/providers";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_allowed: "That account is not allowed on this instance, or has been deactivated.",
  signin: "Sign-in did not complete. Please try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const providers = configuredProviders(env);
  const password = env.AUTH_PASSWORD_SIGNIN;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-8">
        <Wordmark title="okinvo" className="mb-6 h-9 w-auto text-ink" />
        <h1 className="text-display-md text-ink">Sign in</h1>
        <p className="mt-2 text-app-body text-ink-subtle">Only allow-listed accounts can enter.</p>
        {errorKey ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-semantic-danger/40 bg-surface-2 p-3 text-app-caption text-semantic-danger"
          >
            {ERRORS[errorKey] ?? "Sign-in failed."}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-6">
          {providers.length > 0 ? <SignInButtons providers={providers} /> : null}
          {providers.length > 0 && password ? (
            <div className="flex items-center gap-3 text-app-caption text-ink-tertiary">
              <span className="h-px flex-1 bg-hairline" />
              or
              <span className="h-px flex-1 bg-hairline" />
            </div>
          ) : null}
          {password ? <PasswordSignInForm /> : null}
          {providers.length === 0 && !password ? (
            <p className="rounded-md border border-hairline bg-surface-2 p-4 text-app-caption text-ink-muted">
              No sign-in method is configured. Set a provider pair such as{" "}
              <code className="font-mono">AUTH_GITHUB_ID</code> /{" "}
              <code className="font-mono">AUTH_GITHUB_SECRET</code>, or{" "}
              <code className="font-mono">AUTH_PASSWORD_SIGNIN=true</code>, in{" "}
              <code className="font-mono">.env</code>.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
