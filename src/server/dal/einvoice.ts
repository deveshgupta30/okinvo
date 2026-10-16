import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { toGstEInvoice, GstEInvoiceError } from "@/lib/einvoice/gst/build";
import {
  CANCEL_REASONS,
  CANCEL_WINDOW_MS,
  EInvoiceError,
  type CancelReason,
  type IrpConnector,
  type IrpResult,
} from "@/lib/einvoice/gst/connector";
import { parseIrpResponse } from "@/lib/einvoice/gst/manual";
import { NicConnector } from "@/lib/einvoice/gst/nic";
import { einvoiceInputFromInvoice } from "@/lib/einvoice/input";
import { EInvoiceStateSchema, type EInvoiceState } from "@/lib/schemas/einvoice-state";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { requireWriter } from "./authz";
import { ensureDocument, regenerateDocument } from "./documents";
import { einvoiceConnectorFor, resolveNicCredentials } from "./einvoice-settings";
import { InvariantError } from "./errors";
import { getInvoice, type InvoiceDto } from "./invoices";

/**
 * IRN registration of issued invoices (spec §9e). The state lives in `Invoice.einvoice`, the
 * one field of an issued document that changes after issue besides sending, voiding and
 * payments; every change is audited and the stored PDF is regenerated as a new version so
 * the document in the archive carries the IRN and the signed QR.
 */
export type { EInvoiceState };

function stateOf(inv: InvoiceDto): EInvoiceState {
  return inv.einvoice ?? { status: "NONE" };
}

async function loadIssued(actor: Actor, invoiceId: string): Promise<InvoiceDto> {
  const inv = await getInvoice(actor, invoiceId);
  if (inv.status !== "ISSUED") {
    throw new InvariantError("Only issued invoices are registered as e-invoices.");
  }
  if (inv.taxRegime !== "INDIA_GST") {
    throw new InvariantError("E-invoice registration applies to invoices under India GST.");
  }
  return inv;
}

async function save(
  actor: Actor,
  inv: InvoiceDto,
  state: EInvoiceState,
  action: "einvoice.registered" | "einvoice.cancelled" | "einvoice.failed",
  summary: string,
): Promise<EInvoiceState> {
  const parsed = EInvoiceStateSchema.parse(state);
  const before = stateOf(inv);
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: inv.id },
      data: { einvoice: parsed as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, actor, action, "Invoice", inv.id, {
      summary,
      before: { status: before.status, irn: before.irn },
      after: { status: parsed.status, irn: parsed.irn, ackNo: parsed.ackNo },
    });
  });
  return parsed;
}

/** The connector configured for the invoice's issuer profile, or null when e-invoicing is off. */
async function connectorFor(
  inv: InvoiceDto,
): Promise<{ kind: "manual" } | { kind: "nic"; connector: IrpConnector } | null> {
  const kind = await einvoiceConnectorFor(inv.issuerProfileId);
  if (!kind) return null;
  if (kind === "manual") return { kind: "manual" };
  const creds = await resolveNicCredentials(inv.issuerProfileId);
  if (!creds)
    throw new InvariantError(
      "The NIC connector has no credentials; set them under Settings > E-invoicing.",
    );
  return {
    kind: "nic",
    connector: new NicConnector({
      baseUrl: creds.baseUrl,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      username: creds.username,
      password: creds.password,
      gstin: creds.gstin,
      publicKeyPem: creds.publicKeyPem,
    }),
  };
}

function registered(result: IrpResult, connector: "manual" | "nic"): EInvoiceState {
  return {
    status: "REGISTERED",
    irn: result.irn,
    ackNo: result.ackNo,
    ackDate: result.ackDate,
    signedQr: result.signedQr,
    ...(result.signedInvoice ? { signedInvoice: result.signedInvoice } : {}),
    connector,
  };
}

/**
 * The canonical PDF is rendered in the background after issue (actions/invoices.ts). A
 * registration or cancellation recorded inside that window would otherwise race it for version
 * 1 and refuse to overwrite the blob, so the first version is settled before the invoice changes;
 * the regenerate that follows is then always a later version.
 */
async function settleFirstVersion(invoiceId: string): Promise<void> {
  await ensureDocument("INVOICE", invoiceId);
}

/** Registers through the configured NIC connector (EDITOR); the manual connector needs the pasted response. */
export async function generateIrn(actor: Actor, invoiceId: string): Promise<EInvoiceState> {
  requireWriter(actor);
  const inv = await loadIssued(actor, invoiceId);
  const current = stateOf(inv);
  if (current.status === "REGISTERED") throw new InvariantError("This invoice already has an IRN.");
  if (current.status === "CANCELLED") {
    throw new InvariantError(
      "A cancelled IRN cannot be registered again; void and reissue the invoice.",
    );
  }
  const target = await connectorFor(inv);
  if (!target) throw new InvariantError("E-invoicing is not configured for this issuer profile.");
  if (target.kind === "manual") {
    throw new InvariantError("The manual connector takes the portal's response: paste it below.");
  }
  let payload;
  try {
    payload = toGstEInvoice(einvoiceInputFromInvoice(inv));
  } catch (e) {
    if (e instanceof GstEInvoiceError) throw new InvariantError(e.message);
    throw e;
  }
  await settleFirstVersion(inv.id);
  try {
    const result = await target.connector.generate(payload);
    const state = registered(result, "nic");
    await save(
      actor,
      inv,
      state,
      "einvoice.registered",
      `Registered IRN ${result.irn} with the NIC IRP`,
    );
    await regenerateDocument(actor, "INVOICE", inv.id);
    return state;
  } catch (e) {
    if (e instanceof EInvoiceError) {
      const failed: EInvoiceState = {
        ...current,
        status: "FAILED",
        lastError: e.message,
        connector: "nic",
      };
      await save(actor, inv, failed, "einvoice.failed", `IRN registration failed: ${e.message}`);
      throw new InvariantError(e.message);
    }
    throw e;
  }
}

/** Records the response the owner obtained from the portal or a GSP (EDITOR). */
export async function recordManualIrn(
  actor: Actor,
  invoiceId: string,
  response: unknown,
): Promise<EInvoiceState> {
  requireWriter(actor);
  const inv = await loadIssued(actor, invoiceId);
  const current = stateOf(inv);
  if (current.status === "REGISTERED") throw new InvariantError("This invoice already has an IRN.");
  let result: IrpResult;
  try {
    result = parseIrpResponse(response);
  } catch (e) {
    if (e instanceof EInvoiceError) throw new InvariantError(e.message);
    throw e;
  }
  const state = registered(result, "manual");
  await settleFirstVersion(inv.id);
  await save(
    actor,
    inv,
    state,
    "einvoice.registered",
    `Recorded IRN ${result.irn} from the IRP response`,
  );
  await regenerateDocument(actor, "INVOICE", inv.id);
  return state;
}

/** Cancels within the IRP's 24-hour window (EDITOR); the NIC connector cancels on the portal too. */
export async function cancelIrn(
  actor: Actor,
  invoiceId: string,
  reason: CancelReason,
  remarks: string,
  now: Date = new Date(),
): Promise<EInvoiceState> {
  requireWriter(actor);
  if (!(reason in CANCEL_REASONS)) throw new InvariantError("Choose a cancellation reason.");
  const inv = await loadIssued(actor, invoiceId);
  const current = stateOf(inv);
  if (current.status !== "REGISTERED" || !current.irn || !current.ackDate) {
    throw new InvariantError("Only a registered IRN can be cancelled.");
  }
  if (now.getTime() - Date.parse(current.ackDate) > CANCEL_WINDOW_MS) {
    throw new InvariantError(
      "An IRN can only be cancelled within 24 hours of its acknowledgement.",
    );
  }
  if (current.connector === "nic") {
    const target = await connectorFor(inv);
    if (target?.kind !== "nic") {
      throw new InvariantError(
        "The NIC connector that registered this IRN is no longer configured.",
      );
    }
    try {
      await target.connector.cancel(current.irn, reason, remarks);
    } catch (e) {
      if (e instanceof EInvoiceError) throw new InvariantError(e.message);
      throw e;
    }
  }
  const state: EInvoiceState = {
    ...current,
    status: "CANCELLED",
    cancelledAt: now.toISOString(),
    cancelReason: `${CANCEL_REASONS[reason]}${remarks.trim() ? `: ${remarks.trim()}` : ""}`.slice(
      0,
      200,
    ),
  };
  await settleFirstVersion(inv.id);
  await save(
    actor,
    inv,
    state,
    "einvoice.cancelled",
    `Cancelled IRN ${current.irn} (${CANCEL_REASONS[reason]})`,
  );
  await regenerateDocument(actor, "INVOICE", inv.id);
  return state;
}

export async function einvoiceStatus(actor: Actor, invoiceId: string): Promise<EInvoiceState> {
  return stateOf(await getInvoice(actor, invoiceId));
}
