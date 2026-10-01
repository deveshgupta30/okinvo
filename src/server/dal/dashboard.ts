import "server-only";
import { compareDates, fromDateString, todayIn, toDateString, type DateString } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { D, roundMoney, toMoneyString } from "@/lib/money";
import { fiscalYearOf, fiscalYearRange } from "@/lib/numbering";
import type { Actor } from "@/server/actor";
import { listInvoices, type InvoiceListRow } from "./invoices";

export interface DashboardBucket {
  currency: string;
  count: number;
  amount: string;
}

export interface Dashboard {
  today: DateString;
  profileLabel: string | null;
  baseCurrency: string;
  locale: string;
  fiscalYear: string;
  fyRange: { from: DateString; to: DateString };
  outstanding: DashboardBucket[];
  overdue: DashboardBucket[];
  /** Base currency, using each invoice's fxRateToBase (R9). */
  billedThisFy: string;
  receivedThisFy: string;
  draftsCount: number;
  recent: InvoiceListRow[];
  topClients: { clientId: string; name: string; currency: string; outstanding: string }[];
}

function buckets(rows: { currency: string; amount: string }[]): DashboardBucket[] {
  const map = new Map<string, { count: number; amount: ReturnType<typeof D> }>();
  for (const r of rows) {
    const cur = map.get(r.currency) ?? { count: 0, amount: D(0) };
    cur.count += 1;
    cur.amount = cur.amount.plus(D(r.amount));
    map.set(r.currency, cur);
  }
  return [...map.entries()]
    .map(([currency, v]) => ({
      currency,
      count: v.count,
      amount: toMoneyString(v.amount, currency),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** SPEC §4.14. Scoped to one issuer profile when asked, otherwise every profile. */
export async function dashboardData(
  actor: Actor,
  o: { issuerProfileId?: string | undefined } = {},
): Promise<Dashboard> {
  const profile = o.issuerProfileId
    ? await prisma.issuerProfile.findUnique({ where: { id: o.issuerProfileId } })
    : ((await prisma.issuerProfile.findFirst({ where: { isDefault: true } })) ??
      (await prisma.issuerProfile.findFirst({ orderBy: { createdAt: "asc" } })));
  const baseCurrency = profile?.baseCurrency ?? "INR";
  const locale = profile?.locale ?? "en-IN";
  const startMonth = profile?.fiscalYearStartMonth ?? 4;
  const today = todayIn(actor.timezone);
  const fiscalYear = fiscalYearOf(today, startMonth);
  const fyRange = fiscalYearRange(fiscalYear, startMonth);
  const scope = o.issuerProfileId ? { issuerProfileId: o.issuerProfileId } : {};

  const open = await prisma.invoice.findMany({
    where: { ...scope, status: "ISSUED", balanceDue: { gt: 0 } },
    select: {
      currency: true,
      balanceDue: true,
      dueDate: true,
      clientId: true,
      client: { select: { displayName: true } },
    },
  });
  const openRows = open.map((r) => ({
    currency: r.currency,
    amount: r.balanceDue.toString(),
    dueDate: toDateString(r.dueDate),
    clientId: r.clientId,
    clientName: r.client.displayName,
  }));
  const overdueRows = openRows.filter((r) => compareDates(r.dueDate, today) < 0);

  const billed = await prisma.invoice.findMany({
    where: {
      ...scope,
      status: "ISSUED",
      issueDate: { gte: fromDateString(fyRange.from), lte: fromDateString(fyRange.to) },
    },
    select: { total: true, fxRateToBase: true },
  });
  const billedThisFy = billed.reduce(
    (acc, r) => acc.plus(D(r.total.toString()).mul(D(r.fxRateToBase.toString()))),
    D(0),
  );
  const received = await prisma.payment.findMany({
    where: {
      kind: { in: ["PAYMENT", "REFUND"] },
      paymentDate: { gte: fromDateString(fyRange.from), lte: fromDateString(fyRange.to) },
      invoice: { ...scope },
    },
    select: { amountApplied: true, invoice: { select: { fxRateToBase: true } } },
  });
  const receivedThisFy = received.reduce(
    (acc, r) => acc.plus(D(r.amountApplied.toString()).mul(D(r.invoice.fxRateToBase.toString()))),
    D(0),
  );

  const [draftsCount, allRows] = await Promise.all([
    prisma.invoice.count({ where: { ...scope, status: "DRAFT" } }),
    listInvoices(actor, { issuerProfileId: o.issuerProfileId }),
  ]);

  const byClient = new Map<
    string,
    { clientId: string; name: string; currency: string; amount: ReturnType<typeof D> }
  >();
  for (const r of openRows) {
    const key = `${r.clientId}:${r.currency}`;
    const cur = byClient.get(key) ?? {
      clientId: r.clientId,
      name: r.clientName,
      currency: r.currency,
      amount: D(0),
    };
    cur.amount = cur.amount.plus(D(r.amount));
    byClient.set(key, cur);
  }
  const topClients = [...byClient.values()]
    .sort((a, b) => b.amount.comparedTo(a.amount))
    .slice(0, 5)
    .map((c) => ({
      clientId: c.clientId,
      name: c.name,
      currency: c.currency,
      outstanding: toMoneyString(c.amount, c.currency),
    }));

  return {
    today,
    profileLabel: profile?.label ?? null,
    baseCurrency,
    locale,
    fiscalYear,
    fyRange,
    outstanding: buckets(openRows),
    overdue: buckets(overdueRows),
    billedThisFy: toMoneyString(roundMoney(billedThisFy, baseCurrency), baseCurrency),
    receivedThisFy: toMoneyString(roundMoney(receivedThisFy, baseCurrency), baseCurrency),
    draftsCount,
    recent: allRows.slice(0, 10),
    topClients,
  };
}
