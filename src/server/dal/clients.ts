import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { Address } from "@/lib/schemas";
import type { ClientInput } from "@/lib/schemas/client-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { InvariantError, NotFoundError } from "./errors";

type Row = Prisma.ClientGetPayload<object>;
const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export interface ClientDto {
  id: string;
  displayName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: Address;
  shippingAddress: Address | null;
  countryCode: string;
  stateCode: string | null;
  gstStateCode: string | null;
  taxIdType: "GSTIN" | "VAT" | "EIN" | "OTHER" | null;
  taxId: string | null;
  currency: string;
  paymentTermsDays: number;
  defaultTdsRate: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: Row): ClientDto {
  return {
    id: row.id,
    displayName: row.displayName,
    contactPerson: row.contactPerson,
    email: row.email,
    phone: row.phone,
    billingAddress: row.billingAddress as Address,
    shippingAddress: (row.shippingAddress as Address | null) ?? null,
    countryCode: row.countryCode,
    stateCode: row.stateCode,
    gstStateCode: row.gstStateCode,
    taxIdType: row.taxIdType,
    taxId: row.taxId,
    currency: row.currency,
    paymentTermsDays: row.paymentTermsDays,
    defaultTdsRate: row.defaultTdsRate?.toString() ?? null,
    notes: row.notes,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toData(input: ClientInput) {
  return {
    displayName: input.displayName,
    contactPerson: input.contactPerson ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    billingAddress: json(input.billingAddress),
    shippingAddress: input.shippingAddress ? json(input.shippingAddress) : Prisma.DbNull,
    countryCode: input.countryCode,
    stateCode: input.stateCode ?? null,
    gstStateCode: input.gstStateCode ?? null,
    taxIdType: input.taxIdType ?? null,
    taxId: input.taxId ?? null,
    currency: input.currency,
    paymentTermsDays: input.paymentTermsDays,
    defaultTdsRate: input.defaultTdsRate ?? null,
    notes: input.notes ?? null,
  };
}

function auditView(row: Row): Record<string, unknown> {
  const { createdAt: _c, updatedAt: _u, ...rest } = row;
  return rest as Record<string, unknown>;
}

async function load(tx: Tx, id: string): Promise<Row> {
  const row = await tx.client.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Client", id);
  return row;
}

export async function listClients(
  _actor: Actor,
  o: { q?: string; includeArchived?: boolean } = {},
): Promise<ClientDto[]> {
  const rows = await prisma.client.findMany({
    where: {
      ...(o.includeArchived ? { archivedAt: {} } : {}),
      ...(o.q ? { displayName: { contains: o.q, mode: "insensitive" } } : {}),
    },
    orderBy: { displayName: "asc" },
  });
  return rows.map(toDto);
}

export async function getClient(_actor: Actor, id: string): Promise<ClientDto> {
  return toDto(await load(prisma, id));
}

export async function createClient(actor: Actor, input: ClientInput): Promise<ClientDto> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.client.create({ data: toData(input) });
    await audit(tx, actor, "client.created", "Client", row.id, {
      summary: `Created client ${row.displayName}`,
      after: auditView(row),
    });
    return toDto(row);
  });
}

export async function updateClient(
  actor: Actor,
  id: string,
  input: ClientInput,
): Promise<ClientDto> {
  return prisma.$transaction(async (tx) => {
    const before = await load(tx, id);
    const row = await tx.client.update({ where: { id }, data: toData(input) });
    const diff = diffForAudit(auditView(before), auditView(row));
    await audit(tx, actor, "client.updated", "Client", id, {
      summary: `Updated client ${row.displayName}`,
      before: diff.before,
      after: diff.after,
    });
    return toDto(row);
  });
}

export async function archiveClient(actor: Actor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.archivedAt) return;
    await tx.client.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, actor, "client.archived", "Client", id, {
      summary: `Archived client ${row.displayName}`,
    });
  });
}

export async function unarchiveClient(actor: Actor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (!row.archivedAt) return;
    await tx.client.update({ where: { id }, data: { archivedAt: null } });
    await audit(tx, actor, "client.unarchived", "Client", id, {
      summary: `Restored client ${row.displayName}`,
    });
  });
}

/** Clients referenced by any invoice are archived, never deleted (SPEC §4.3). */
export async function deleteClient(actor: Actor, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    const refs = await tx.invoice.count({ where: { clientId: id } });
    if (refs > 0) {
      throw new InvariantError("This client has invoices; archive it instead of deleting.");
    }
    await tx.client.delete({ where: { id } });
    await audit(tx, actor, "client.deleted", "Client", id, {
      summary: `Deleted client ${row.displayName}`,
      before: auditView(row),
    });
  });
}
