import "server-only";
import type { DateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { fiscalYearRange } from "@/lib/numbering";

export interface DateRange {
  from?: DateString | undefined;
  to?: DateString | undefined;
}

/**
 * Turns an index page's `fy` / `from` / `to` filters into an inclusive calendar range. A fiscal
 * year is resolved against the chosen issuer's start month, else the default profile's (4 = April
 * when there is none). An FY label that does not fit the start month yields no range rather than an
 * error, so a stale link still lists everything. `fy` wins over an explicit range.
 */
export async function resolveDateRange(f: {
  fy?: string | undefined;
  from?: DateString | undefined;
  to?: DateString | undefined;
  issuerProfileId?: string | undefined;
}): Promise<DateRange> {
  if (!f.fy) return { from: f.from, to: f.to };
  const profile = f.issuerProfileId
    ? await prisma.issuerProfile.findUnique({ where: { id: f.issuerProfileId } })
    : await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
  try {
    return fiscalYearRange(f.fy, profile?.fiscalYearStartMonth ?? 4);
  } catch {
    return {};
  }
}
