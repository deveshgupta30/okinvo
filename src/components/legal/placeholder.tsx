import { COUNTRIES } from "@/lib/countries";
import { LEGAL_FIELD_LABELS, type LegalOperator } from "@/lib/schemas/legal-operator";

/**
 * An operator value inside a legal text, or a highlighted chip naming the missing field so a
 * reader (and the owner) can see the document is not finished (spec §6.4).
 */
export function Placeholder({ op, field }: { op: LegalOperator; field: keyof LegalOperator }) {
  const raw = op[field];
  const value =
    field === "country" && raw
      ? (COUNTRIES.find((c) => c.code === raw)?.name ?? raw)
      : field === "entityType" && raw
        ? raw === "COMPANY"
          ? "a company"
          : "an individual"
        : raw;
  if (value) return <span data-operator-field={field}>{value}</span>;
  return (
    <mark
      data-placeholder={field}
      className="rounded-sm bg-semantic-warning/15 px-1 font-mono text-app-caption text-semantic-warning"
    >
      [{LEGAL_FIELD_LABELS[field]}]
    </mark>
  );
}

/** "Contact: privacy@…" style line that falls back to the contact address, then a chip. */
export function OperatorEmail({
  op,
  field,
}: {
  op: LegalOperator;
  field: "contactEmail" | "privacyEmail" | "dpoEmail";
}) {
  const value = op[field] ?? (field === "privacyEmail" ? op.contactEmail : undefined);
  if (value) {
    return (
      <a href={`mailto:${value}`} className="text-link underline-offset-4 hover:underline">
        {value}
      </a>
    );
  }
  return <Placeholder op={op} field={field} />;
}
