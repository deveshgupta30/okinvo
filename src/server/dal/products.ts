import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { toMoneyString } from "@/lib/money";
import type { ProductInput } from "@/lib/schemas/product-input";
import type { UnitType } from "@/lib/schemas/service-input";
import type { Actor } from "@/server/actor";
import { audit } from "./audit";
import { diffForAudit } from "./audit-redact";
import { requireWriter } from "./authz";
import { ConflictError, InvariantError, NotFoundError } from "./errors";

type Row = NonNullable<Awaited<ReturnType<typeof prisma.product.findUnique>>>;

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  unitType: UnitType;
  unitPrice: string;
  currency: string;
  hsnCode: string | null;
  defaultTaxRate: string;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: Row): ProductDto {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unitType: row.unitType,
    unitPrice: toMoneyString(row.unitPrice, row.currency),
    currency: row.currency,
    hsnCode: row.hsnCode,
    defaultTaxRate: row.defaultTaxRate.toString(),
    isActive: row.isActive,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toData(input: ProductInput) {
  return {
    sku: input.sku,
    name: input.name,
    description: input.description ?? null,
    unitType: input.unitType,
    unitPrice: input.unitPrice,
    currency: input.currency,
    hsnCode: input.hsnCode ?? null,
    defaultTaxRate: input.defaultTaxRate,
    isActive: input.isActive,
  };
}

function auditView(row: Row): Record<string, unknown> {
  return {
    sku: row.sku,
    name: row.name,
    description: row.description,
    unitType: row.unitType,
    unitPrice: toMoneyString(row.unitPrice, row.currency),
    currency: row.currency,
    hsnCode: row.hsnCode,
    defaultTaxRate: row.defaultTaxRate.toString(),
    isActive: row.isActive,
    archivedAt: row.archivedAt,
  };
}

async function load(tx: Tx, id: string): Promise<Row> {
  const row = await tx.product.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Product", id);
  return row;
}

/** A duplicate SKU is a conflict the form can show on the field, not a 500. */
function mapUniqueSku<T>(p: Promise<T>): Promise<T> {
  return p.catch((e: unknown) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ConflictError("A product with this SKU already exists.", {
        sku: ["already in use"],
      });
    }
    throw e;
  });
}

export async function listProducts(
  _actor: Actor,
  o: { includeArchived?: boolean; activeOnly?: boolean } = {},
): Promise<ProductDto[]> {
  const rows = await prisma.product.findMany({
    where: {
      ...(o.includeArchived ? { archivedAt: {} } : {}),
      ...(o.activeOnly ? { isActive: true } : {}),
    },
    orderBy: { name: "asc" },
  });
  return rows.map(toDto);
}

export async function getProduct(_actor: Actor, id: string): Promise<ProductDto> {
  return toDto(await load(prisma, id));
}

export async function createProduct(actor: Actor, input: ProductInput): Promise<ProductDto> {
  requireWriter(actor);
  return mapUniqueSku(
    prisma.$transaction(async (tx) => {
      const row = await tx.product.create({ data: toData(input) });
      await audit(tx, actor, "product.created", "Product", row.id, {
        summary: `Created product ${row.sku} ${row.name}`,
        after: auditView(row),
      });
      return toDto(row);
    }),
  );
}

export async function updateProduct(
  actor: Actor,
  id: string,
  input: ProductInput,
): Promise<ProductDto> {
  requireWriter(actor);
  return mapUniqueSku(
    prisma.$transaction(async (tx) => {
      const before = await load(tx, id);
      const row = await tx.product.update({ where: { id }, data: toData(input) });
      const diff = diffForAudit(auditView(before), auditView(row));
      await audit(tx, actor, "product.updated", "Product", id, {
        summary: `Updated product ${row.sku}`,
        before: diff.before,
        after: diff.after,
      });
      return toDto(row);
    }),
  );
}

export async function toggleProductActive(actor: Actor, id: string, isActive: boolean) {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    await tx.product.update({ where: { id }, data: { isActive } });
    await audit(tx, actor, "product.updated", "Product", id, {
      summary: `${isActive ? "Activated" : "Deactivated"} product ${row.sku}`,
      before: { isActive: row.isActive },
      after: { isActive },
    });
  });
}

export async function archiveProduct(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (row.archivedAt) return;
    await tx.product.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
    await audit(tx, actor, "product.archived", "Product", id, {
      summary: `Archived product ${row.sku}`,
    });
  });
}

export async function unarchiveProduct(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    if (!row.archivedAt) return;
    await tx.product.update({ where: { id }, data: { archivedAt: null, isActive: true } });
    await audit(tx, actor, "product.unarchived", "Product", id, {
      summary: `Restored product ${row.sku}`,
    });
  });
}

export async function deleteProduct(actor: Actor, id: string): Promise<void> {
  requireWriter(actor);
  await prisma.$transaction(async (tx) => {
    const row = await load(tx, id);
    const refs = await tx.invoiceItem.count({ where: { productId: id } });
    if (refs > 0) {
      throw new InvariantError("This product is used on invoices; archive it instead.");
    }
    await tx.product.delete({ where: { id } });
    await audit(tx, actor, "product.deleted", "Product", id, {
      summary: `Deleted product ${row.sku}`,
      before: auditView(row),
    });
  });
}
