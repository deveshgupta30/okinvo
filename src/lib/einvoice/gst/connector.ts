import type { GstEInvoice } from "./schema";

/**
 * Registration of a GST e-invoice with the Invoice Registration Portal (spec §9e). A connector
 * turns the INV-01 payload into an IRN (and a signed QR) and can cancel within the IRP's
 * 24-hour window; `manual` takes the portal's response by hand, `nic` talks to the NIC API.
 */
export class EInvoiceError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "EInvoiceError";
  }
}

export interface IrpResult {
  /** 64-character hex hash the IRP assigns. */
  irn: string;
  ackNo: string;
  /** ISO instant of the acknowledgement. */
  ackDate: string;
  /** The signed QR payload (a JWT) to print on the document. */
  signedQr: string;
  /** The signed invoice (a JWT), kept for the records. */
  signedInvoice?: string;
}

/** The IRP's cancellation reason codes. */
export const CANCEL_REASONS = {
  "1": "Duplicate",
  "2": "Data entry mistake",
  "3": "Order cancelled",
  "4": "Others",
} as const;
export type CancelReason = keyof typeof CANCEL_REASONS;

export interface IrpConnector {
  generate(payload: GstEInvoice): Promise<IrpResult>;
  cancel(irn: string, reason: CancelReason, remarks: string): Promise<void>;
}

/** Registration is allowed to be cancelled for 24 hours after the acknowledgement. */
export const CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whether a registered state is still inside the IRP's cancellation window. */
export function canCancel(
  state: { status: string; ackDate?: string | undefined },
  now: Date = new Date(),
): boolean {
  return (
    state.status === "REGISTERED" &&
    state.ackDate !== undefined &&
    now.getTime() - Date.parse(state.ackDate) < CANCEL_WINDOW_MS
  );
}
