import "server-only";
import { decryptField, encryptField } from "@/lib/crypto";
import { fieldKey } from "@/lib/crypto/key";
import { prisma, type Tx } from "@/lib/db";
import {
  PaymentMethodDetailsSchema,
  paymentMethodLines,
  type PaymentMethodDetails,
  type PaymentMethodLine,
  type PaymentMethodType,
} from "@/lib/schemas";
import type { PaymentMethodInput } from "@/lib/schemas/payment-method-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { InvariantError, NotFoundError } from "./errors";
import { requireWriter } from "./authz";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.paymentMethodProfile.findUnique>>>;

export interface PaymentMethodDto {
  id: string;
  name: string;
  type: PaymentMethodType;
  currency: string | null;
  isDefault: boolean;
  isActive: boolean;
  instructions: string | null;
  /** Present only when the caller asked to decrypt. */
  details?: PaymentMethodDetails;
  /** Printable rows (decrypted), present with `details`. */
  lines?: PaymentMethodLine[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function decryptDetails(enc: string): PaymentMethodDetails {
  return PaymentMethodDetailsSchema.parse(JSON.parse(decryptField(enc, fieldKey())));
}

function toDto(row: Row, decrypt: boolean): PaymentMethodDto {
  const base: PaymentMethodDto = {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    isDefault: row.isDefault,
    isActive: row.isActive,
    instructions: row.instructions,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (!decrypt) return base;
  const details = decryptDetails(row.detailsEnc);
  return { ...base, details, lines: paymentMethodLines(details) };
}

function toData(input: PaymentMethodInput) {
  return {
    name: input.name,
    type: input.type,
    currency: input.currency ?? null,
    isActive: input.isActive,
    instructions: input.instructions ?? null,
    detailsEnc: encryptField(JSON.stringify(input.details), fieldKey()),
  };
}

function auditView(row: Row): Record<string, unknown> {
  return {
    name: row.name,
    type: row.type,
    currency: row.currency,
    isDefault: row.isDefault,
    isActive: row.isActive,
    instructions: row.instructions,
    detailsEnc: row.detailsEnc, // redacted by audit()
    archivedAt: row.archivedAt,
  };
}

async function load(tx: Tx, id: string): Promise<Row> {
  const row = await tx.paymentMethodProfile.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Payment method", id);
  return row;
}

export async function listPaymentMethods(
  _actor: Actor,
  o: { includeArchived?: boolean; activeOnly?: boolean; decrypt?: boolean } = {},
): Promise<PaymentMethodDto[]> {
  const rows = await prisma.paymentMethodProfile.findMany({
    where: {
      ...(o.includeArchived ? { archivedAt: {} } : {}),
      ...(o.activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => toDto(r, o.decrypt ?? false));
}

export async function getPaymentMethod(_actor: Actor, id: string): Promise<PaymentMethodDto> {
  return toDto(await load(prisma, id), true);
}

export async function createPaymentMethod(
  actor: Actor,
  input: PaymentMethodInput,
): Promise<PaymentMethodDto> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.paymentMethodProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    const row = await tx.paymentMethodProfile.create({
      data: { ...toData(input), isDefault: input.isDefault },
    });
    await audit(tx, actor, "payment_method.created", "PaymentMethodProfile", row.id, {
      summary: `Created payment method ${row.name}`,
      after: auditView(row),
    });
    return toDto(row, false);
  });
}

export async function updatePaymentMethod(
  actor: Actor,
  id: string,
  input: PaymentMethodInput,
): Promise<PaymentMethodDto> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    const before = await load(tx, id);
    if (input.isDefault && !before.isDefault) {
      await tx.paymentMethodProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    const row = await tx.paymentMethodProfile.update({
      where: { id },
      data: { ...toData(input), isDefault: input.isDefault },
    });
    const diff = diffForAudit(auditView(before), auditView(row));
    await audit(tx, actor, "payment_method.updated", "PaymentMethodProfile", id, {
      summary: `Updated payment method ${row.name}`,
      before: diff.before,
      after: diff.after,
    });
    return toDto(row, false);
  });
}

export async function setDefaultPaymentMethod(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.archivedAt) throw new InvariantError("An archived method cannot be the default");
    await tx.paymentMethodProfile.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    await tx.paymentMethodProfile.update({ where: { id }, data: { isDefault: true } });
    await audit(tx, actor, "payment_method.default_set", "PaymentMethodProfile", id, {
      summary: `${row.name} is now the default payment method`,
    });
  });
}

export async function archivePaymentMethod(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.archivedAt) return;
    await tx.paymentMethodProfile.update({
      where: { id },
      data: { archivedAt: new Date(), isDefault: false, isActive: false },
    });
    await audit(tx, actor, "payment_method.archived", "PaymentMethodProfile", id, {
      summary: `Archived payment method ${row.name}`,
    });
  });
}

export async function unarchivePaymentMethod(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (!row.archivedAt) return;
    await tx.paymentMethodProfile.update({
      where: { id },
      data: { archivedAt: null, isActive: true },
    });
    await audit(tx, actor, "payment_method.unarchived", "PaymentMethodProfile", id, {
      summary: `Restored payment method ${row.name}`,
    });
  });
}

export async function deletePaymentMethod(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    const refs =
      (await tx.invoicePaymentMethod.count({ where: { paymentMethodProfileId: id } })) +
      (await tx.payment.count({ where: { paymentMethodProfileId: id } }));
    if (refs > 0) {
      throw new InvariantError("This method is used on invoices or payments; archive it instead.");
    }
    await tx.paymentMethodProfile.delete({ where: { id } });
    await audit(tx, actor, "payment_method.deleted", "PaymentMethodProfile", id, {
      summary: `Deleted payment method ${row.name}`,
      before: auditView(row),
    });
  });
}
