import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalFooter } from "@/components/legal/footer";
import { Wordmark } from "@/components/brand/logo";
import { PasswordSignInForm } from "@/components/password-sign-in-form";
import { SignInButtons } from "@/components/sign-in-buttons";
import { configuredProviders } from "@/lib/auth/providers";
import { env } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("metaTitle") };
}

const ERROR_KEYS = ["not_allowed", "signin"] as const;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, t, tc] = await Promise.all([
    searchParams,
    getTranslations("auth.signIn"),
    getTranslations("common"),
  ]);
  const errorParam = typeof params.error === "string" ? params.error : undefined;
  const errorKey = ERROR_KEYS.find((k) => k === errorParam);
  const providers = configuredProviders(env);
  const password = env.AUTH_PASSWORD_SIGNIN;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-sm rounded-lg border border-hairline bg-surface-1 p-8">
        <Wordmark title={tc("appName")} className="mb-6 h-9 w-auto text-ink" />
        <h1 className="text-display-md text-ink">{t("title")}</h1>
        <p className="mt-2 text-app-body text-ink-subtle">{t("subtitle")}</p>
        {errorParam ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-semantic-danger/40 bg-surface-2 p-3 text-app-caption text-semantic-danger"
          >
            {errorKey ? t(`errors.${errorKey}`) : t("failed")}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-6">
          {providers.length > 0 ? <SignInButtons providers={providers} /> : null}
          {providers.length > 0 && password ? (
            <div className="flex items-center gap-3 text-app-caption text-ink-tertiary">
              <span className="h-px flex-1 bg-hairline" />
              {tc("or")}
              <span className="h-px flex-1 bg-hairline" />
            </div>
          ) : null}
          {password ? <PasswordSignInForm /> : null}
          {providers.length === 0 && !password ? (
            <p className="rounded-md border border-hairline bg-surface-2 p-4 text-app-caption text-ink-muted">
              {t.rich("noMethod", {
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </p>
          ) : null}
        </div>
      </section>
      <LegalFooter />
    </main>
  );
}
