import { z } from "zod";

/**
 * Structured payment-method details (SPEC.md §4.5), stored encrypted in `PaymentMethod.details`
 * and snapshotted as printable lines at issue time. Discriminated on `type`, which mirrors the
 * Prisma `PaymentMethodType` enum as a string union so this module stays browser-safe.
 *
 * Optional text fields accept "" (form inputs send empty strings); a blank value counts as
 * absent for the BANK_TRANSFER "at least one field" rule and is skipped when printing.
 */

export const PAYMENT_METHOD_TYPES = [
  "BANK_TRANSFER",
  "UPI",
  "WISE",
  "REVOLUT",
  "PAYPAL",
  "CUSTOM",
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

const text = (max: number) => z.string().trim().max(max).optional();

const BANK_FIELDS = {
  accountHolder: text(64),
  accountNumber: text(64),
  bankName: text(64),
  branch: text(64),
  ifsc: text(64),
  swift: text(64),
  iban: text(64),
  routingCode: text(64),
};
type BankFieldKey = keyof typeof BANK_FIELDS;
type BankFields = { [K in BankFieldKey]?: string | undefined };

/** Fixed print order with the labels used on documents. */
const BANK_FIELD_ROWS: ReadonlyArray<{ key: BankFieldKey; label: string }> = [
  { key: "accountHolder", label: "Account holder" },
  { key: "accountNumber", label: "Account number" },
  { key: "bankName", label: "Bank name" },
  { key: "branch", label: "Branch" },
  { key: "ifsc", label: "IFSC" },
  { key: "swift", label: "SWIFT/BIC" },
  { key: "iban", label: "IBAN" },
  { key: "routingCode", label: "Routing/sort code" },
];

const present = (v: string | undefined): v is string => (v ?? "").trim() !== "";

const BankTransferSchema = z
  .object({ type: z.literal("BANK_TRANSFER"), ...BANK_FIELDS })
  .superRefine((d, ctx) => {
    if (!BANK_FIELD_ROWS.some(({ key }) => present(d[key]))) {
      ctx.addIssue({ code: "custom", message: "at least one bank field is required" });
    }
  });

/** UPI virtual payment address: `name@bank`. */
export const UPI_VPA_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

const UpiSchema = z.object({
  type: z.literal("UPI"),
  vpa: z.string().trim().regex(UPI_VPA_RE, "must be a UPI ID like name@bank"),
  payeeName: text(120),
});

/** Email or handle for the wallet-style providers plus any of the bank fields. */
const WALLET_FIELDS = { accountEmail: text(120), ...BANK_FIELDS };
const WiseSchema = z.object({ type: z.literal("WISE"), ...WALLET_FIELDS });
const RevolutSchema = z.object({ type: z.literal("REVOLUT"), ...WALLET_FIELDS });
const PaypalSchema = z.object({ type: z.literal("PAYPAL"), ...WALLET_FIELDS });

const CustomSchema = z.object({
  type: z.literal("CUSTOM"),
  lines: z.array(z.string().trim().max(120)).min(1).max(10),
});

export const PaymentMethodDetailsSchema = z.discriminatedUnion("type", [
  BankTransferSchema,
  UpiSchema,
  WiseSchema,
  RevolutSchema,
  PaypalSchema,
  CustomSchema,
]);

export type PaymentMethodDetails = z.infer<typeof PaymentMethodDetailsSchema>;

export interface PaymentMethodLine {
  label: string;
  value: string;
}

const rows = (pairs: ReadonlyArray<readonly [string, string | undefined]>): PaymentMethodLine[] =>
  pairs.flatMap(([label, value]) => (present(value) ? [{ label, value: value.trim() }] : []));

const bankLines = (d: BankFields): PaymentMethodLine[] =>
  rows(BANK_FIELD_ROWS.map(({ key, label }) => [label, d[key]] as const));

/**
 * Printable rows in a fixed order, skipping absent fields. CUSTOM lines print verbatim with an
 * empty label. This is what `PaymentMethodsSnapshotSchema.lines` stores at issue time.
 */
export function paymentMethodLines(d: PaymentMethodDetails): PaymentMethodLine[] {
  switch (d.type) {
    case "BANK_TRANSFER":
      return bankLines(d);
    case "UPI":
      return rows([
        ["UPI ID", d.vpa],
        ["Payee name", d.payeeName],
      ]);
    case "WISE":
    case "REVOLUT":
    case "PAYPAL":
      return [...rows([["Account email", d.accountEmail]]), ...bankLines(d)];
    case "CUSTOM":
      return d.lines
        .map((line) => line.trim())
        .filter(Boolean)
        .map((value) => ({ label: "", value }));
  }
}
