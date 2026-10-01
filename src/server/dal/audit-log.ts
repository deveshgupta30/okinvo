import "server-only";
import { z } from "zod";
import { DateStringSchema, fromDateString, addDays } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type { Actor } from "@/server/actor";

export const AuditFiltersSchema = z.object({
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(64).optional(),
  action: z.string().trim().max(60).optional(),
  from: DateStringSchema.optional(),
  to: DateStringSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AuditFilters = z.infer<typeof AuditFiltersSchema>;

export interface AuditEventDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  before: unknown;
  after: unknown;
  actorName: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditEvents(
  _actor: Actor,
  filters: AuditFilters,
): Promise<{ rows: AuditEventDto[]; total: number; page: number; pageSize: number }> {
  const where = {
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.action ? { action: { contains: filters.action } } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: fromDateString(filters.from) } : {}),
            ...(filters.to ? { lt: fromDateString(addDays(filters.to, 1)) } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);
  return {
    total,
    page: filters.page,
    pageSize: AUDIT_PAGE_SIZE,
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      before: r.before,
      after: r.after,
      actorName: r.actor?.name ?? null,
      actorEmail: r.actor?.email ?? null,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function auditEntityTypes(): Promise<string[]> {
  const rows = await prisma.auditEvent.findMany({
    distinct: ["entityType"],
    select: { entityType: true },
    orderBy: { entityType: "asc" },
  });
  return rows.map((r) => r.entityType);
}
