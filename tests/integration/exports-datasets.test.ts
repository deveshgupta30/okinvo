import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportRow } from "@/lib/exports/types";
import { DEFAULT_DISPLAY_CONFIG } from "@/lib/schemas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import { CreditNoteInputSchema } from "@/lib/schemas/credit-note-input";
import { InvoiceDraftInputSchema } from "@/lib/schemas/invoice-input";
import { PaymentInputSchema } from "@/lib/schemas/payment-input";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";
import { ServiceInputSchema } from "@/lib/schemas/service-input";
import type { Actor } from "@/server/actor";

const url = process.env.DATABASE_URL;
if (!url && process.env.CI) throw new Error("DATABASE_URL is required when CI is set");

const actor: Actor = {
  userId: "no-such-user",
  email: "o@example.com",
  name: "O",
  role: "OWNER",
  timezone: "UTC",
  locale: "en-US",
};
const tag = `exp-${Date.now()}`;
const address = {
  line1: "1 Test Street",
  line2: "Floor 2",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

async function collect<Row>(it: AsyncIterable<Row>): Promise<Row[]> {
  const out: Row[] = [];
  for await (const r of it) out.push(r);
  return out;
}

describe.skipIf(!url)("export datasets", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let datasets: typeof import("@/server/exports/datasets");
  let inv: typeof import("@/server/dal/invoices");
  let storage: typeof import("@/lib/storage").storage;
  let profileId: string;
  let clientId: string;
  let archivedClientId: string;
  let serviceId: string;
  const invoiceIds: string[] = [];
  let numbers: (string | null)[] = [];

  beforeAll(async () => {
    process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ??= "http://127.0.0.1:3000";
    ({ prisma } = await import("@/lib/db"));
    ({ storage } = await import("@/lib/storage"));
    datasets = await import("@/server/exports/datasets");
    inv = await import("@/server/dal/invoices");
    const profiles = await import("@/server/dal/profiles");
    const clients = await import("@/server/dal/clients");
    const services = await import("@/server/dal/services");
    const payments = await import("@/server/dal/payments");
    const cns = await import("@/server/dal/credit-notes");

    const hadDefault = await prisma.issuerProfile.findFirst({ where: { isDefault: true } });
    const p = await profiles.createProfile(
      actor,
      ProfileInputSchema.parse({
        type: "INDIVIDUAL",
        label: `${tag} issuer`,
        legalName: `${tag} Legal`,
        email: "me@example.com",
        address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        gstin: "29ABCDE1234F1Z5",
        baseCurrency: "INR",
        locale: "en-IN",
        fiscalYearStartMonth: 4,
        invoiceNumberFormat: "EXP/{FY}/{SEQ:3}",
        creditNoteNumberFormat: "ECN/{FY}/{SEQ:3}",
        defaultTaxRegime: "INDIA_GST",
        emailCc: [],
        emailBcc: [],
      }),
    );
    if (hadDefault)
      await prisma.issuerProfile.update({ where: { id: p.id }, data: { isDefault: false } });
    profileId = p.id;

    const c = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} client`,
        contactPerson: "=cmd",
        billingAddress: address,
        countryCode: "IN",
        stateCode: "KA",
        gstStateCode: "29",
        taxIdType: "GSTIN",
        taxId: "29AAAAA0000A1Z5",
        currency: "INR",
        paymentTermsDays: 15,
      }),
    );
    clientId = c.id;
    const archived = await clients.createClient(
      actor,
      ClientInputSchema.parse({
        displayName: `${tag} archived client`,
        billingAddress: address,
        countryCode: "IN",
        currency: "INR",
        paymentTermsDays: 30,
      }),
    );
    archivedClientId = archived.id;
    await clients.archiveClient(actor, archived.id);

    const s = await services.createService(
      actor,
      ServiceInputSchema.parse({
        name: `${tag} consulting`,
        unitType: "HOUR",
        defaultRate: "1000",
        currency: "INR",
        sacHsnCode: "998314",
        defaultTaxRate: "18",
      }),
    );
    serviceId = s.id;

    const draft = async (
      issueDate: string,
      items: Record<string, string>[],
      extra: Record<string, unknown> = {},
    ) => {
      const d = await inv.createDraft(
        actor,
        InvoiceDraftInputSchema.parse({
          issuerProfileId: profileId,
          clientId,
          issueDate,
          dueDate: "2027-03-31",
          currency: "INR",
          taxRegime: "INDIA_GST",
          tdsRate: "10",
          items,
          displayConfig: DEFAULT_DISPLAY_CONFIG,
          ...extra,
        }),
      );
      invoiceIds.push(d.id);
      return d;
    };
    const hour = (qty: string, taxRate = "18") => ({
      description: "Work",
      sacHsnCode: "998314",
      unitType: "HOUR",
      quantity: qty,
      unitPrice: "1000",
      taxRate,
    });

    // Invoice 1: 10 h × 1000 @ 18 % → 10000 + 900 + 900 = 11800; paid 5000 with 500 TDS; CN 1000.
    const i1 = await inv.issueInvoice(
      actor,
      (await draft("2026-05-01", [hour("10")], { poReference: "PO-1" })).id,
    );
    await payments.recordPayment(
      actor,
      i1.id,
      PaymentInputSchema.parse({
        kind: "PAYMENT",
        paymentDate: "2026-05-20",
        amountApplied: "5000",
        tdsDeducted: "500",
        reference: "UTR-1",
      }),
    );
    const cn = await cns.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: i1.id,
        reason: "Scope reduced",
        subtotal: "1000",
        issueDate: "2026-05-25",
      }),
    );
    await cns.issueCreditNote(actor, cn.id);
    // Invoice 2: two GST rates on one invoice → two GST-summary rows.
    const i2 = await inv.issueInvoice(
      actor,
      (await draft("2026-06-01", [hour("2"), { ...hour("4", "5"), description: "Printing" }])).id,
    );
    // Invoice 3: a draft — in the register, never in the GST/TDS summaries.
    const i3 = await draft("2026-06-15", [hour("1")]);
    numbers = [i1.number, i2.number, i3.number];
  });

  afterAll(async () => {
    const docs = await prisma.document.findMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { creditNote: { invoiceId: { in: invoiceIds } } }],
      },
    });
    for (const r of docs) await storage.delete(r.storageKey).catch(() => undefined);
    await prisma.document.deleteMany({
      where: {
        OR: [{ invoiceId: { in: invoiceIds } }, { creditNote: { invoiceId: { in: invoiceIds } } }],
      },
    });
    await prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.documentSequence.deleteMany({ where: { issuerProfileId: profileId } });
    await prisma.serviceItem.deleteMany({ where: { id: serviceId } });
    await prisma.client.deleteMany({ where: { id: { in: [clientId, archivedClientId] } } });
    await prisma.issuerProfile.deleteMany({ where: { id: profileId } });
  });

  const run = async (id: string, filters: Record<string, string>, pageSize?: number) => {
    const ds = datasets.getDataset(id);
    if (!ds) throw new Error(`no dataset ${id}`);
    const parsed = ds.filters.parse(filters);
    const rows = await collect(ds.rows(actor, parsed, pageSize ? { pageSize } : {}));
    return { ds, rows: rows as ExportRow[], parsed };
  };

  it("lists every dataset with the spec's columns", () => {
    expect(datasets.DATASETS.map((d) => d.id)).toEqual([
      "invoices",
      "invoice-items",
      "payments",
      "credit-notes",
      "clients",
      "services",
      "products",
      "gst-summary",
      "tds-summary",
    ]);
    const headers = (id: string) => datasets.getDataset(id)?.columns.map((c) => c.header);
    expect(headers("invoices")).toEqual([
      "Number",
      "Status",
      "Issue date",
      "Due date",
      "Issuer",
      "Client",
      "Client tax ID",
      "Place of supply",
      "Supply type",
      "Currency",
      "Subtotal",
      "Discount",
      "Taxable",
      "CGST",
      "SGST",
      "IGST",
      "VAT",
      "Other tax",
      "Rounding",
      "Total",
      "TDS expected",
      "Paid",
      "Credited",
      "Balance",
      "FX rate",
      "Base-currency total",
      "PO ref",
      "Sent at",
      "Void reason",
    ]);
    expect(headers("gst-summary")).toEqual([
      "Invoice number",
      "Date",
      "Client GSTIN",
      "Place of supply",
      "Supply type",
      "Rate",
      "Taxable",
      "CGST",
      "SGST",
      "IGST",
      "Total",
    ]);
    expect(datasets.getDataset("nope")).toBeNull();
  });

  it("exports the invoices register with per-type tax, balances and base-currency totals", async () => {
    const { rows, ds, parsed } = await run("invoices", {
      fy: "2026-27",
      issuerProfileId: profileId,
    });
    expect(rows.map((r) => r.number)).toEqual(numbers);
    expect(await ds.range(parsed)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    const r1 = rows[0];
    expect(r1).toMatchObject({
      status: "PARTIALLY_PAID",
      issueDate: "2026-05-01",
      dueDate: "2027-03-31",
      issuer: `${tag} Legal`,
      client: `${tag} client`,
      clientTaxId: "29AAAAA0000A1Z5",
      placeOfSupply: "Karnataka (29)",
      supplyType: "INTRA_STATE",
      currency: "INR",
      subtotal: "10000.00",
      discount: "0.00",
      taxable: "10000.00",
      cgst: "900.00",
      sgst: "900.00",
      igst: "0.00",
      vat: "0.00",
      otherTax: "0.00",
      rounding: "0.00",
      total: "11800.00",
      tdsExpected: "1000.00",
      paid: "5000.00",
      credited: "1180.00",
      balance: "5620.00",
      fxRate: "1",
      baseTotal: "11800.00",
      poReference: "PO-1",
      sentAt: null,
      voidReason: null,
    });
    expect(rows[2]).toMatchObject({ number: null, status: "DRAFT" });
  });

  it("pages through the register with a cursor without skipping or repeating rows", async () => {
    const { rows } = await run("invoices", { issuerProfileId: profileId }, 2);
    expect(rows.map((r) => r.number)).toEqual(numbers);
  });

  it("applies the register's status and client filters", async () => {
    const drafts = await run("invoices", { issuerProfileId: profileId, status: "DRAFT" });
    expect(drafts.rows.map((r) => r.number)).toEqual([null]);
    const none = await run("invoices", { issuerProfileId: profileId, clientId: archivedClientId });
    expect(none.rows).toEqual([]);
  });

  it("exports line items in invoice order with positions and quantities", async () => {
    const { rows } = await run("invoice-items", { issuerProfileId: profileId, status: "ISSUED" });
    expect(rows.map((r) => [r.invoiceNumber, r.position, r.description])).toEqual([
      [numbers[1], "1", "Work"],
      [numbers[1], "2", "Printing"],
    ]);
    expect(rows[1]).toMatchObject({
      issueDate: "2026-06-01",
      client: `${tag} client`,
      sacHsnCode: "998314",
      unit: "HOUR",
      quantity: "4.000",
      rate: "1000.00",
      lineSubtotal: "4000.00",
      taxRate: "5.00",
      taxAmount: "200.00",
      lineTotal: "4200.00",
    });
  });

  it("exports the payments ledger across invoices", async () => {
    const { rows } = await run("payments", {
      issuerProfileId: profileId,
      from: "2026-04-01",
      to: "2027-03-31",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2026-05-20",
      kind: "PAYMENT",
      invoiceNumber: numbers[0],
      client: `${tag} client`,
      currency: "INR",
      amountApplied: "5000.00",
      tdsDeducted: "500.00",
      receivedAmount: null,
      receivedCurrency: null,
      fxRate: null,
      bankFees: "0.00",
      method: null,
      reference: "UTR-1",
      notes: null,
    });
    const outside = await run("payments", { issuerProfileId: profileId, to: "2026-05-19" });
    expect(outside.rows).toEqual([]);
  });

  it("exports the credit-notes register", async () => {
    const { rows } = await run("credit-notes", { issuerProfileId: profileId, fy: "2026-27" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      number: "ECN/26-27/001",
      status: "ISSUED",
      issueDate: "2026-05-25",
      againstInvoice: numbers[0],
      client: `${tag} client`,
      currency: "INR",
      subtotal: "1000.00",
      tax: "180.00",
      total: "1180.00",
      reason: "Scope reduced",
    });
  });

  it("exports clients flattened, honouring the archived filter", async () => {
    const active = await run("clients", {});
    const mine = active.rows.filter((r) => String(r.displayName).startsWith(tag));
    expect(mine.map((r) => r.displayName)).toEqual([`${tag} client`]);
    expect(mine[0]).toMatchObject({
      id: clientId,
      contactPerson: "=cmd", // raw here; the writers guard it
      billingLine1: "1 Test Street",
      billingLine2: "Floor 2",
      billingCity: "Bengaluru",
      billingState: "Karnataka",
      billingPostalCode: "560001",
      billingCountry: "IN",
      shippingLine1: null,
      taxIdType: "GSTIN",
      taxId: "29AAAAA0000A1Z5",
      currency: "INR",
      paymentTermsDays: "15",
      archivedAt: null,
    });
    const all = await run("clients", { archived: "1" });
    expect(
      all.rows.filter((r) => String(r.displayName).startsWith(tag)).map((r) => r.displayName),
    ).toEqual([`${tag} archived client`, `${tag} client`]);
    expect(await all.ds.range(all.parsed)).toBeNull();
  });

  it("exports services", async () => {
    const { rows } = await run("services", {});
    const mine = rows.find((r) => r.id === serviceId);
    expect(mine).toMatchObject({
      name: `${tag} consulting`,
      unitType: "HOUR",
      defaultRate: "1000.00",
      currency: "INR",
      sacHsnCode: "998314",
      defaultTaxRate: "18.00",
      isActive: "true",
    });
  });

  it("summarises GST per invoice per rate for issued invoices only", async () => {
    const { rows } = await run("gst-summary", { issuerProfileId: profileId, fy: "2026-27" });
    expect(rows.map((r) => [r.invoiceNumber, r.rate])).toEqual([
      [numbers[0], "18.00"],
      [numbers[1], "5.00"],
      [numbers[1], "18.00"],
    ]);
    expect(rows[0]).toMatchObject({
      date: "2026-05-01",
      clientGstin: "29AAAAA0000A1Z5",
      placeOfSupply: "Karnataka (29)",
      supplyType: "INTRA_STATE",
      taxable: "10000.00",
      cgst: "900.00",
      sgst: "900.00",
      igst: "0.00",
      total: "11800.00",
    });
    expect(rows[1]).toMatchObject({ taxable: "4000.00", cgst: "100.00", sgst: "100.00" });
  });

  it("register and credit-note rows carry the names frozen at issue, not later edits", async () => {
    const clients = await import("@/server/dal/clients");
    const current = await clients.getClient(actor, clientId);
    await prisma.client.update({
      where: { id: clientId },
      data: { displayName: `${tag} client RENAMED` },
    });
    await prisma.issuerProfile.update({
      where: { id: profileId },
      data: { legalName: `${tag} Legal RENAMED` },
    });
    try {
      const { rows } = await run("invoices", { issuerProfileId: profileId, status: "ISSUED" });
      expect(rows[0]).toMatchObject({ client: `${tag} client`, issuer: `${tag} Legal` });
      const cn = await run("credit-notes", { issuerProfileId: profileId, fy: "2026-27" });
      expect(cn.rows[0]).toMatchObject({ client: `${tag} client` });
      // Drafts have no snapshot yet: they show the live names.
      const drafts = await run("invoices", { issuerProfileId: profileId, status: "DRAFT" });
      expect(drafts.rows[0]).toMatchObject({ client: `${tag} client RENAMED` });
    } finally {
      await prisma.client.update({
        where: { id: clientId },
        data: { displayName: current.displayName },
      });
      await prisma.issuerProfile.update({
        where: { id: profileId },
        data: { legalName: `${tag} Legal` },
      });
    }
  });

  it("GST summary falls back to the live client GSTIN when the invoice hid the tax id", async () => {
    const d = await inv.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profileId,
        clientId,
        issueDate: "2026-07-01",
        dueDate: "2027-03-31",
        currency: "INR",
        taxRegime: "INDIA_GST",
        items: [
          {
            description: "Hidden tax id",
            sacHsnCode: "998314",
            unitType: "HOUR",
            quantity: "1",
            unitPrice: "1000",
            taxRate: "18",
          },
        ],
        displayConfig: {
          ...DEFAULT_DISPLAY_CONFIG,
          client: { ...DEFAULT_DISPLAY_CONFIG.client, showTaxIdentifier: false },
        },
      }),
    );
    invoiceIds.push(d.id);
    const issued = await inv.issueInvoice(actor, d.id);
    expect(issued.clientSnapshot?.taxId ?? null).toBeNull();
    const { rows } = await run("gst-summary", { issuerProfileId: profileId, from: "2026-07-01" });
    expect(rows.map((r) => r.invoiceNumber)).toEqual([issued.number]);
    expect(rows[0]).toMatchObject({ clientGstin: "29AAAAA0000A1Z5" });
  });

  it("refuses a fiscal-year label that does not fit the issuer's start month", async () => {
    const ds = datasets.getDataset("invoices");
    if (!ds) throw new Error("no dataset");
    const parsed = ds.filters.parse({ fy: "2026", issuerProfileId: profileId });
    await expect(ds.range(parsed)).rejects.toThrow(/fiscal year/i);
    await expect(collect(ds.rows(actor, parsed))).rejects.toThrow(/fiscal year/i);
  });

  it("summarises TDS per client from issued invoices and recorded payments", async () => {
    // A date range rather than the FY: the GSTIN test above adds a July invoice to this issuer.
    const { rows } = await run("tds-summary", {
      issuerProfileId: profileId,
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      client: `${tag} client`,
      panOrTaxId: "AAAAA0000A",
      currency: "INR",
      invoices: "2",
      taxableBilled: "16000.00",
      tdsExpected: "1600.00",
      tdsDeducted: "500.00",
    });
  });
});
