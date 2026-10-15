"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { HONEYPOT_FIELD, isHoneypotFilled } from "@/lib/security/honeypot";

/**
 * Email + password sign-in (AUTH_PASSWORD_SIGNIN). The first sign-in of an allow-listed address
 * creates the account; anyone else is refused by the server-side allow-list hook.
 */
export function PasswordSignInForm() {
  const t = useTranslations("auth.password");
  const router = useRouter();
  const [mode, setMode] = useState<"signIn" | "create">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (isHoneypotFilled(form)) return; // a bot filled the hidden field: drop it without a word
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setBusy(true);
    setError(null);
    const result =
      mode === "create"
        ? await authClient.signUp.email({ email, password, name: name || email, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
    if (result.error) {
      setError(result.error.message ?? t("failed"));
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="password-sign-in">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {mode === "create" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" autoComplete="name" />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          minLength={12}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-app-caption text-semantic-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? t("signingIn") : mode === "create" ? t("createAccount") : t("signIn")}
      </Button>
      <button
        type="button"
        className="text-app-caption text-link hover:underline"
        onClick={() => setMode(mode === "create" ? "signIn" : "create")}
      >
        {mode === "create" ? t("haveAPassword") : t("firstTime")}
      </button>
    </form>
  );
}
