import { useTranslations } from "next-intl";
import * as React from "react";
import { Label } from "@/components/ui/label";
import { validationMessageKey } from "@/lib/i18n/validation-messages";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label: React.ReactNode;
  htmlFor?: string | undefined;
  hint?: React.ReactNode;
  error?: string | string[] | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}

/**
 * The common server-side validation messages in the UI language; anything else as sent
 * (`src/lib/i18n/validation-messages.ts`).
 */
export function useValidationText(): (raw: string) => string {
  const t = useTranslations("errors.validation");
  return (raw) => {
    const found = validationMessageKey(raw);
    return found ? t(found.key, found.values) : raw;
  };
}

/** Label + control + hint/error. Errors are announced (role=alert) per SPEC §6 accessibility. */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  const text = useValidationText();
  const errors = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden className="ml-1 text-ink-subtle">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {errors.length > 0 ? (
        <p role="alert" className="text-app-caption text-semantic-danger">
          {errors.map(text).join(" ")}
        </p>
      ) : hint ? (
        <p className="text-app-caption text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-4 md:grid-cols-2", className)} {...props} />;
}
