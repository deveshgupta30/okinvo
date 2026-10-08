"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import type { ProviderInfo } from "@/lib/auth/providers";

export function SignInButtons({ providers }: { providers: ProviderInfo[] }) {
  const t = useTranslations("auth.social");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(id: string) {
    setBusy(id);
    setError(null);
    const { error: err } = await authClient.signIn.social({ provider: id, callbackURL: "/" });
    if (err) {
      setError(err.message ?? t("failed"));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <Button
          key={p.id}
          variant="secondary"
          size="lg"
          data-provider={p.id}
          disabled={busy !== null}
          onClick={() => start(p.id)}
        >
          {busy === p.id ? t("redirecting") : t("continueWith", { provider: p.name })}
        </Button>
      ))}
      {error ? (
        <p role="alert" className="text-app-caption text-semantic-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
