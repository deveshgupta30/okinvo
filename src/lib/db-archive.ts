/**
 * Soft delete (SPEC §4.2-4.5): archivable aggregates are hidden from list queries unless the
 * caller names `archivedAt` explicitly (`archivedAt: {}` means "either"). Applied by the Prisma
 * client extension in `lib/db.ts`; DAL code never hand-writes `archivedAt: null` filters.
 */
export const ARCHIVABLE_MODELS: ReadonlySet<string> = new Set([
  "IssuerProfile",
  "Client",
  "ServiceItem",
  "Product",
  "PaymentMethodProfile",
]);

export function withArchiveFilter<T extends { where?: object | undefined }>(
  model: string,
  args: T,
): T {
  if (!ARCHIVABLE_MODELS.has(model)) return args;
  const where = (args.where ?? {}) as Record<string, unknown>;
  if ("archivedAt" in where) return args;
  return { ...args, where: { ...where, archivedAt: null } };
}
