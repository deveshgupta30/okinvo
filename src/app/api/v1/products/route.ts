import { ProductSchema } from "@/lib/api/dto";
import { list } from "@/lib/api/envelope";
import { readQuery, withApi } from "@/lib/api/handlers";
import { paginate } from "@/lib/api/pagination";
import { CatalogueListQuerySchema } from "@/lib/api/query";
import { isActor, requireApiActor } from "@/server/auth";
import { listProducts } from "@/server/dal/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/products (scope catalogue:read). */
export const GET = withApi(async (request: Request) => {
  const actor = await requireApiActor("catalogue:read", request.headers);
  if (!isActor(actor)) return actor;
  const q = readQuery(request, CatalogueListQuerySchema);
  if (!q.ok) return q.response;
  const rows = await listProducts(actor, {
    ...(q.data.includeArchived ? { includeArchived: true } : {}),
    ...(q.data.issuerProfileId ? { forIssuerProfileId: q.data.issuerProfileId } : {}),
  });
  const needle = q.data.q?.toLowerCase();
  const filtered = needle
    ? rows.filter(
        (r) => r.name.toLowerCase().includes(needle) || r.sku.toLowerCase().includes(needle),
      )
    : rows;
  const page = paginate(filtered, { cursor: q.data.cursor, limit: q.data.limit });
  return list(
    page.items.map((r) => ProductSchema.parse(r)),
    page.nextCursor,
  );
});
