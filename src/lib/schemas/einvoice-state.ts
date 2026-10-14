import { z } from "zod";

/**
 * `Invoice.einvoice` / `CreditNote.einvoice` (spec §9e): where the document stands with the
 * tax authority's e-invoice registry. `NONE` until a JSON is generated, `REGISTERED` once an
 * IRN exists, `CANCELLED` after a cancellation on the portal; `FAILED` keeps the last error of
 * a connector call. Browser-safe.
 */
export const EINVOICE_STATUSES = [
  "NONE",
  "GENERATED",
  "REGISTERED",
  "CANCELLED",
  "FAILED",
] as const;
export type EInvoiceStatus = (typeof EINVOICE_STATUSES)[number];

export const EINVOICE_CONNECTORS = ["manual", "nic"] as const;
export type EInvoiceConnector = (typeof EINVOICE_CONNECTORS)[number];

/** The IRN is a 64-character hex hash of the seller GSTIN, the document type, number and year. */
export const IRN_RE = /^[0-9a-f]{64}$/i;

const isoInstant = z.iso.datetime({ offset: true });

export const EInvoiceStateSchema = z
  .object({
    status: z.enum(EINVOICE_STATUSES),
    irn: z.string().regex(IRN_RE, "not an IRN").optional(),
    ackNo: z.string().trim().min(1).max(32).optional(),
    ackDate: isoInstant.optional(),
    /** The IRP's signed QR payload (a JWT); the PDF prints it in place of the okinvo QR. */
    signedQr: z.string().min(1).max(8000).optional(),
    /** The IRP's signed invoice (a JWT), kept for the records. */
    signedInvoice: z.string().min(1).max(200_000).optional(),
    cancelledAt: isoInstant.optional(),
    cancelReason: z.string().trim().min(1).max(200).optional(),
    lastError: z.string().trim().min(1).max(2000).optional(),
    connector: z.enum(EINVOICE_CONNECTORS).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.status === "REGISTERED" || v.status === "CANCELLED") && !v.irn)
      ctx.addIssue({ code: "custom", path: ["irn"], message: "required once registered" });
    if (v.status === "CANCELLED" && (!v.cancelledAt || !v.cancelReason))
      ctx.addIssue({
        code: "custom",
        path: ["cancelReason"],
        message: "a cancellation records when and why",
      });
  });

export type EInvoiceState = z.infer<typeof EInvoiceStateSchema>;

export const EMPTY_EINVOICE_STATE: EInvoiceState = { status: "NONE" };
