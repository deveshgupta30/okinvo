import "server-only";
import { prisma, type Tx } from "@/lib/db";
import { toMoneyString } from "@/lib/money";
import type { ServiceInput, UnitType } from "@/lib/schemas/service-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { InvariantError, NotFoundError } from "./errors";
import { requireWriter } from "./authz";

const TAGS = { issuerProfiles: { select: { id: true } } } as const;
type Row = NonNullable<Awaited<ReturnType<typeof prisma.serviceItem.findUnique>>> & {
  issuerProfiles: { id: string }[];
};

export interface ServiceDto {
  id: string;
  name: string;
  description: string | null;
  unitType: UnitType;
  defaultRate: string;
  currency: string;
  sacHsnCode: string | null;
  defaultTaxRate: string;
  isActive: boolean;
  issuerProfileIds: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: Row): ServiceDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unitType: row.unitType,
    defaultRate: toMoneyString(row.defaultRate, row.currency),
    currency: row.currency,
    sacHsnCode: row.sacHsnCode,
    defaultTaxRate: row.defaultTaxRate.toString(),
    isActive: row.isActive,
    issuerProfileIds: row.issuerProfiles.map((p) => p.id),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toData(input: ServiceInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    unitType: input.unitType,
    defaultRate: input.defaultRate,
    currency: input.currency,
    sacHsnCode: input.sacHsnCode ?? null,
    defaultTaxRate: input.defaultTaxRate,
    isActive: input.isActive,
  };
}

/** Tag rows: `connect` on create, `set` on update (replaces the whole set). */
function tags(input: { issuerProfileIds: string[] }, mode: "connect" | "set") {
  const ids = input.issuerProfileIds.map((id) => ({ id }));
  return mode === "connect" ? { connect: ids } : { set: ids };
}

function auditView(row: Row): Record<string, unknown> {
  return {
    name: row.name,
    description: row.description,
    unitType: row.unitType,
    defaultRate: toMoneyString(row.defaultRate, row.currency),
    currency: row.currency,
    sacHsnCode: row.sacHsnCode,
    defaultTaxRate: row.defaultTaxRate.toString(),
    isActive: row.isActive,
    issuerProfileIds: row.issuerProfiles.map((p) => p.id),
    archivedAt: row.archivedAt,
  };
}

async function load(tx: Tx, id: string): Promise<Row> {
  const row = await tx.serviceItem.findUnique({ where: { id }, include: TAGS });
  if (!row) throw new NotFoundError("Service", id);
  return row;
}

export async function listServices(
  _actor: Actor,
  o: { includeArchived?: boolean; activeOnly?: boolean; forIssuerProfileId?: string } = {},
): Promise<ServiceDto[]> {
  const rows = await prisma.serviceItem.findMany({
    where: {
      ...(o.includeArchived ? { archivedAt: {} } : {}),
      ...(o.activeOnly ? { isActive: true } : {}),
      ...(o.forIssuerProfileId
        ? {
            OR: [
              { issuerProfiles: { none: {} } },
              { issuerProfiles: { some: { id: o.forIssuerProfileId } } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: TAGS,
  });
  return rows.map(toDto);
}

export async function getService(_actor: Actor, id: string): Promise<ServiceDto> {
  return toDto(await load(prisma, id));
}

export async function createService(actor: Actor, input: ServiceInput): Promise<ServiceDto> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    const row = await tx.serviceItem.create({
      data: { ...toData(input), issuerProfiles: tags(input, "connect") },
      include: TAGS,
    });
    await audit(tx, actor, "service.created", "ServiceItem", row.id, {
      summary: `Created service ${row.name}`,
      after: auditView(row),
    });
    return toDto(row);
  });
}

export async function updateService(
  actor: Actor,
  id: string,
  input: ServiceInput,
): Promise<ServiceDto> {
  requireWriter(actor);
  return prisma.$transaction(async (tx) => {
    const before = await load(tx, id);
    const row = await tx.serviceItem.update({
      where: { id },
      data: { ...toData(input), issuerProfiles: tags(input, "set") },
      include: TAGS,
    });
    const diff = diffForAudit(auditView(before), auditView(row));
    await audit(tx, actor, "service.updated", "ServiceItem", id, {
      summary: `Updated service ${row.name}`,
      before: diff.before,
      after: diff.after,
    });
    return toDto(row);
  });
}

export async function toggleServiceActive(actor: Actor, id: string, isActive: boolean) {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    await tx.serviceItem.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, "service.updated", "ServiceItem", id, {
      summary: `${isActive ? "Activated" : "Deactivated"} service ${row.name}`,
      before: { isActive: row.isActive },
      after: { isActive },
    });
  });
}

export async function archiveService(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.archivedAt) return;
    await tx.serviceItem.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });
    await audit(tx, actor, "service.archived", "ServiceItem", id, {
      summary: `Archived service ${row.name}`,
    });
  });
}

export async function unarchiveService(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (!row.archivedAt) return;
    await tx.serviceItem.update({ where: { id }, data: { archivedAt: null, isActive: true } });
    await audit(tx, actor, "service.unarchived", "ServiceItem", id, {
      summary: `Restored service ${row.name}`,
    });
  });
}

export async function deleteService(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    const refs = await tx.invoiceItem.count({ where: { serviceItemId: id } });
    if (refs > 0) {
      throw new InvariantError("This service is used on invoices; archive it instead.");
    }
    await tx.serviceItem.delete({ where: { id } });
    await audit(tx, actor, "service.deleted", "ServiceItem", id, {
      summary: `Deleted service ${row.name}`,
      before: auditView(row),
    });
  });
}
