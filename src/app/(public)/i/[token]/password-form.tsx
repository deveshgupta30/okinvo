import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HONEYPOT_FIELD } from "@/lib/security/honeypot";

/** Plain HTML form: a POST to the password route, which sets the cookie and redirects back. */
export async function PasswordForm({ token, error }: { token: string; error: string | null }) {
  const t = await getTranslations("share.password");
  return (
    <form method="post" action={`/i/${token}/password`} className="mt-6 flex flex-col gap-4">
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <Field
        label={t("label")}
        htmlFor="share-password"
        error={error === "limited" ? [t("limited")] : error ? [t("wrong")] : undefined}
        required
      >
        <Input
          id="share-password"
          name="password"
          type="password"
          autoComplete="off"
          autoFocus
          maxLength={128}
        />
      </Field>
      <div>
        <Button type="submit">{t("submit")}</Button>
      </div>
    </form>
  );
}
