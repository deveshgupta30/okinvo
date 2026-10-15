import "server-only";
import { prisma } from "@/lib/db";
import { addDays, type DateString } from "@/lib/dates";

/**
 * Local, cookie-less page views (addendum §2 item 19): one row per path per UTC day with a
 * counter, nothing else. No user, address or agent is stored, so there is nothing to consent to.
 * Off unless ANALYTICS_LOCAL=true; the shell's beacon posts every screen (hard loads and soft
 * navigations alike) to /api/usage/view.
 */
export interface UsageRow {
  day: DateString;
  path: string;
  count: number;
}

/** A UUID (every row id) or a share or verification token (32+ url-safe characters). */
const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{32,})$/;
const MAX_PATH = 200;

/** Query strings dropped, ids collapsed to `:id`, so a day's rows stay a short list of screens. */
export function normalisePath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? "/";
  const parts = path.split("/").map((p) => (ID_SEGMENT.test(p) ? ":id" : p));
  return parts.join("/").slice(0, MAX_PATH) || "/";
}

export async function recordPageView(path: string, day: DateString): Promise<void> {
  const normalised = normalisePath(path);
  await prisma.pageView.upsert({
    where: { day_path: { day, path: normalised } },
    create: { day, path: normalised, count: 1 },
    update: { count: { increment: 1 } },
  });
}

/** The last 30 days up to and including `today`, newest day first, then by path. */
export async function usageLast30Days(today: DateString): Promise<UsageRow[]> {
  const from = addDays(today, -29);
  const rows = await prisma.pageView.findMany({
    where: { day: { gte: from, lte: today } },
    orderBy: [{ day: "desc" }, { path: "asc" }],
  });
  return rows.map((r) => ({ day: r.day, path: r.path, count: r.count }));
}
