import { z } from "zod";
import { IRN_RE } from "@/lib/schemas/einvoice-state";
import { EInvoiceError, type IrpResult } from "./connector";

/**
 * The manual connector (spec §9e): the owner registers the JSON on the portal or through a
 * GSP and pastes the response. Both the raw NIC shape and a `{ Data: {...} }` envelope are
 * accepted; the acknowledgement date is IST ("2026-04-15 10:30:00") unless it carries a zone.
 */
const ResponseSchema = z
  .object({
    Irn: z.string().regex(IRN_RE, "Irn must be the 64-character hash"),
    AckNo: z.union([z.string(), z.number()]),
    AckDt: z.string().min(1),
    SignedQRCode: z.string().min(1),
    SignedInvoice: z.string().min(1).optional(),
  })
  .loose();

export function parseIstDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/.exec(
    s.trim(),
  );
  if (!m) throw new EInvoiceError(`AckDt "${s}" is not a date and time`);
  const [, y, mo, d, h, mi, sec, zone] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec ?? "00"}${zone ?? "+05:30"}`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new EInvoiceError(`AckDt "${s}" is not a valid date`);
  return new Date(t).toISOString();
}

export function parseIrpResponse(json: unknown): IrpResult {
  let value: unknown = json;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new EInvoiceError("The IRP response is not valid JSON.");
    }
  }
  if (value && typeof value === "object" && "Data" in value && typeof value.Data === "object") {
    value = value.Data;
  }
  const parsed = ResponseSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new EInvoiceError(`IRP response: ${issue?.path.join(".") || "shape"} ${issue?.message}`);
  }
  const r = parsed.data;
  return {
    irn: r.Irn.toLowerCase(),
    ackNo: String(r.AckNo),
    ackDate: parseIstDate(r.AckDt),
    signedQr: r.SignedQRCode,
    ...(r.SignedInvoice ? { signedInvoice: r.SignedInvoice } : {}),
  };
}
