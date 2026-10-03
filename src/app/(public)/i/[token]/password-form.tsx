import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Plain HTML form: a POST to the password route, which sets the cookie and redirects back. */
export function PasswordForm({ token, error }: { token: string; error: string | null }) {
  return (
    <form method="post" action={`/i/${token}/password`} className="mt-6 flex flex-col gap-4">
      <Field
        label="Password"
        htmlFor="share-password"
        error={
          error === "limited"
            ? ["Too many attempts. Please wait fifteen minutes and try again."]
            : error
              ? ["That password is not right."]
              : undefined
        }
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
        <Button type="submit">Open document</Button>
      </div>
    </form>
  );
}
