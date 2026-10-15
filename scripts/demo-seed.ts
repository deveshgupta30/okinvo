/**
 * Demo data for the documentation screenshots (scripts/docs-screenshots.ts) and for trying the
 * app on a development database: a demo owner (password sign-in), an issuer profile, clients, a
 * catalogue, payment methods, invoices in every status, payments, a credit note and a share link.
 * Everything goes through the DAL like the integration tests do, so the data is exactly what the
 * app would have written. Idempotent: each row is found by its label, name, address or PO
 * reference before it is created.
 *
 *   node --import tsx --import ./scripts/lib/strip-server-only.mjs scripts/demo-seed.ts
 *
 * The owner signs in with DEMO_EMAIL / DEMO_PASSWORD; the second account is left in the
 * first-run wizard so the onboarding screens can be captured.
 */
import "dotenv/config";
import path from "node:path";

process.env.APP_URL ??= "http://127.0.0.1:3000";
process.env.AUTH_PASSWORD_SIGNIN ??= "true";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_ONBOARDING_EMAIL = "demo-onboarding@example.com";
export const DEMO_PASSWORD = "correct horse battery staple";
export const DEMO_PROFILE_LABEL = "Asha Rao Design";

export type DemoIds = {
  profileId: string;
  clientId: string;
  /** Issued, partially paid, with a share link: the invoice page screenshots. */
  invoiceId: string;
  draftInvoiceId: string;
  creditNoteId: string;
  shareUrl: string;
};

type Actor = import("../src/server/actor").Actor;

const ADDRESS_IN = {
  line1: "14 Lavelle Road",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

export async function seedDemo(): Promise<DemoIds> {
  const { prisma } = await import("../src/lib/db");
  const { auth } = await import("../src/server/auth-config");
  const { DEFAULT_DISPLAY_CONFIG } = await import("../src/lib/schemas");
  const { ProfileInputSchema } = await import("../src/lib/schemas/profile-input");
  const { ClientInputSchema } = await import("../src/lib/schemas/client-input");
  const { ServiceInputSchema } = await import("../src/lib/schemas/service-input");
  const { ProductInputSchema } = await import("../src/lib/schemas/product-input");
  const { PaymentMethodInputSchema } = await import("../src/lib/schemas/payment-method-input");
  const { InvoiceDraftInputSchema } = await import("../src/lib/schemas/invoice-input");
  const { PaymentInputSchema } = await import("../src/lib/schemas/payment-input");
  const { CreditNoteInputSchema } = await import("../src/lib/schemas/credit-note-input");
  const profiles = await import("../src/server/dal/profiles");
  const clients = await import("../src/server/dal/clients");
  const services = await import("../src/server/dal/services");
  const products = await import("../src/server/dal/products");
  const methods = await import("../src/server/dal/payment-methods");
  const invoices = await import("../src/server/dal/invoices");
  const payments = await import("../src/server/dal/payments");
  const creditNotes = await import("../src/server/dal/credit-notes");
  const shares = await import("../src/server/dal/share-links");

  // Accounts: an invitation row admits the address whatever the env allow-list says.
  const ensureUser = async (email: string, name: string, onboarded: boolean) => {
    await prisma.allowedEmail.upsert({
      where: { email },
      create: { email, role: "OWNER", active: true },
      update: { role: "OWNER", active: true },
    });
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await auth.api.signUpEmail({ body: { email, password: DEMO_PASSWORD, name } });
      user = await prisma.user.findUniqueOrThrow({ where: { email } });
    }
    return prisma.user.update({
      where: { id: user.id },
      data: {
        name,
        role: "OWNER",
        timezone: "Asia/Kolkata",
        countryCode: "IN",
        currency: "INR",
        usage: onboarded ? "BUSINESS" : null,
        onboardedAt: onboarded ? (user.onboardedAt ?? new Date("2026-04-01T04:30:00Z")) : null,
        deactivatedAt: null,
      },
    });
  };
  const owner = await ensureUser(DEMO_EMAIL, "Asha Rao", true);
  await ensureUser(DEMO_ONBOARDING_EMAIL, "Sam Demo", false);
  const actor: Actor = {
    userId: owner.id,
    email: owner.email,
    name: owner.name,
    role: "OWNER",
    timezone: "Asia/Kolkata",
    locale: "en-US",
  };

  // Issuer profile
  const existingProfile = await prisma.issuerProfile.findFirst({
    where: { label: DEMO_PROFILE_LABEL },
    select: { id: true },
  });
  const profile = existingProfile
    ? await profiles.getProfile(actor, existingProfile.id)
    : await profiles.createProfile(
        actor,
        ProfileInputSchema.parse({
          type: "INDIVIDUAL",
          label: DEMO_PROFILE_LABEL,
          legalName: "Asha Rao",
          designation: "Product designer",
          email: "asha@example.com",
          phone: "+91 98765 43210",
          website: "asharao.design",
          address: ADDRESS_IN,
          countryCode: "IN",
          stateCode: "KA",
          gstStateCode: "29",
          panNumber: "ABCDE1234F",
          gstin: "29ABCDE1234F1Z5",
          lutNumber: "AD290426001234X",
          lutFiscalYear: "2026-27",
          baseCurrency: "INR",
          locale: "en-IN",
          fiscalYearStartMonth: 4,
          invoiceNumberFormat: "INV/{FY}/{SEQ:3}",
          creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
          defaultTaxRegime: "INDIA_GST",
          defaultTdsRate: "10",
          defaultNotes: "Thank you for your business.",
          defaultTerms: "Payment within 15 days. Late payments attract 1.5% interest per month.",
          emailCc: [],
          emailBcc: [],
        }),
      );
  if (
    !profile.isDefault &&
    !(await prisma.issuerProfile.findFirst({ where: { isDefault: true } }))
  ) {
    await profiles.setDefaultProfile(actor, profile.id);
  }

  // Payment methods
  const ensureMethod = async (input: Record<string, unknown>) => {
    const found = await prisma.paymentMethodProfile.findFirst({
      where: { name: String(input["name"]) },
      select: { id: true },
    });
    return found ?? methods.createPaymentMethod(actor, PaymentMethodInputSchema.parse(input));
  };
  const bank = await ensureMethod({
    name: "HDFC current account",
    type: "BANK_TRANSFER",
    currency: "INR",
    details: {
      type: "BANK_TRANSFER",
      accountHolder: "Asha Rao",
      accountNumber: "50100123456789",
      ifsc: "HDFC0001234",
      bankName: "HDFC Bank",
      branch: "Lavelle Road",
    },
    instructions: "Please quote the invoice number in the transfer reference.",
    isDefault: true,
    isActive: true,
  });
  const upi = await ensureMethod({
    name: "UPI",
    type: "UPI",
    currency: "INR",
    details: { type: "UPI", vpa: "asha@okhdfcbank", payeeName: "Asha Rao" },
    isDefault: false,
    isActive: true,
  });

  // Clients
  const ensureClient = async (input: Record<string, unknown>) => {
    const found = await prisma.client.findFirst({
      where: { displayName: String(input["displayName"]) },
      select: { id: true },
    });
    return found ?? clients.createClient(actor, ClientInputSchema.parse(input));
  };
  const northwind = await ensureClient({
    displayName: "Northwind Technologies Pvt Ltd",
    contactPerson: "Priya Menon",
    email: "accounts@northwind.example",
    phone: "+91 124 456 7890",
    billingAddress: {
      line1: "Tower B, Cyber City",
      city: "Gurugram",
      state: "Haryana",
      postalCode: "122002",
      countryCode: "IN",
    },
    countryCode: "IN",
    stateCode: "HR",
    gstStateCode: "06",
    taxIdType: "GSTIN",
    taxId: "06AAACN1234A1Z9",
    currency: "INR",
    paymentTermsDays: 15,
    defaultTdsRate: "10",
  });
  const brightline = await ensureClient({
    displayName: "Brightline Labs",
    contactPerson: "Rohan Iyer",
    email: "finance@brightline.example",
    billingAddress: {
      line1: "3rd Floor, Church Street",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      countryCode: "IN",
    },
    countryCode: "IN",
    stateCode: "KA",
    gstStateCode: "29",
    taxIdType: "GSTIN",
    taxId: "29AABCB1234C1ZQ",
    currency: "INR",
    paymentTermsDays: 15,
    defaultTdsRate: "10",
  });
  const contoso = await ensureClient({
    displayName: "Contoso GmbH",
    contactPerson: "Jonas Weber",
    email: "ap@contoso.example",
    billingAddress: {
      line1: "Friedrichstrasse 100",
      city: "Berlin",
      postalCode: "10117",
      countryCode: "DE",
    },
    countryCode: "DE",
    taxIdType: "VAT",
    taxId: "DE123456789",
    currency: "EUR",
    paymentTermsDays: 30,
  });

  // Catalogue
  const ensureService = async (input: Record<string, unknown>) => {
    const found = await prisma.serviceItem.findFirst({
      where: { name: String(input["name"]) },
      select: { id: true },
    });
    return found ?? services.createService(actor, ServiceInputSchema.parse(input));
  };
  const workshop = await ensureService({
    name: "Product discovery workshop",
    description: "On-site, two facilitators",
    unitType: "DAY",
    defaultRate: "45000.00",
    currency: "INR",
    sacHsnCode: "998314",
    defaultTaxRate: "18",
    isActive: true,
    issuerProfileIds: [],
  });
  const design = await ensureService({
    name: "UI design",
    unitType: "HOUR",
    defaultRate: "2500.00",
    currency: "INR",
    sacHsnCode: "998314",
    defaultTaxRate: "18",
    isActive: true,
    issuerProfileIds: [],
  });
  const usability = await ensureService({
    name: "Usability test",
    description: "Recruiting and moderation of five sessions",
    unitType: "FIXED",
    defaultRate: "35000.00",
    currency: "INR",
    sacHsnCode: "998314",
    defaultTaxRate: "18",
    isActive: true,
    issuerProfileIds: [],
  });
  const ensureProduct = async (input: Record<string, unknown>) => {
    const found = await prisma.product.findFirst({
      where: { sku: String(input["sku"]) },
      select: { id: true },
    });
    return found ?? products.createProduct(actor, ProductInputSchema.parse(input));
  };
  const kit = await ensureProduct({
    sku: "KIT-UX-01",
    name: "Design system starter kit",
    description: "Figma library and token export",
    unitType: "UNIT",
    unitPrice: "12000.00",
    currency: "INR",
    hsnCode: "998314",
    defaultTaxRate: "18",
    isActive: true,
    issuerProfileIds: [],
  });
  await ensureProduct({
    sku: "BOOK-UX-02",
    name: "Research playbook (print)",
    unitType: "UNIT",
    unitPrice: "1800.00",
    currency: "INR",
    hsnCode: "4901",
    defaultTaxRate: "12",
    isActive: true,
    issuerProfileIds: [],
  });

  // Invoices, found by their PO reference so a second run adds nothing.
  type Line = {
    description: string;
    unitType: "HOUR" | "DAY" | "FIXED" | "MILESTONE" | "UNIT";
    quantity: string;
    unitPrice: string;
    taxRate: string;
    sacHsnCode?: string;
    serviceItemId?: string;
    productId?: string;
    sku?: string;
  };
  const line = (
    svc: { id: string } | null,
    description: string,
    unitType: Line["unitType"],
    quantity: string,
    unitPrice: string,
    taxRate = "18",
  ): Line => ({
    description,
    unitType,
    quantity,
    unitPrice,
    taxRate,
    sacHsnCode: "998314",
    ...(svc ? { serviceItemId: svc.id } : {}),
  });
  const ensureInvoice = async (
    po: string,
    o: {
      clientId: string;
      issueDate: string;
      dueDate: string;
      currency?: string;
      items: Line[];
      discount?: { type: "AMOUNT" | "PERCENT"; value: string } | null;
      roundingAdjustment?: string;
      fxRateToBase?: string;
      notes?: string;
      issue: boolean;
    },
  ) => {
    const found = await prisma.invoice.findFirst({
      where: { poReference: po, issuerProfileId: profile.id },
      select: { id: true },
    });
    if (found) return invoices.getInvoice(actor, found.id);
    const draft = await invoices.createDraft(
      actor,
      InvoiceDraftInputSchema.parse({
        issuerProfileId: profile.id,
        clientId: o.clientId,
        issueDate: o.issueDate,
        dueDate: o.dueDate,
        currency: o.currency ?? "INR",
        taxRegime: "INDIA_GST",
        isReverseCharge: false,
        fxRateToBase: o.fxRateToBase ?? "1",
        items: o.items,
        discount: o.discount ?? null,
        roundingAdjustment: o.roundingAdjustment ?? null,
        tdsRate: o.currency && o.currency !== "INR" ? "0" : "10",
        paymentMethodIds: o.currency && o.currency !== "INR" ? [bank.id] : [bank.id, upi.id],
        displayConfig: DEFAULT_DISPLAY_CONFIG,
        poReference: po,
        notes: o.notes ?? "Thank you for your business.",
        terms: "Payment within 15 days. Late payments attract 1.5% interest per month.",
      }),
    );
    return o.issue ? invoices.issueInvoice(actor, draft.id) : draft;
  };
  const pay = async (
    invoiceId: string,
    paymentDate: string,
    amountApplied: string,
    tdsDeducted: string,
    reference: string,
  ) => {
    const ledger = await payments.listPayments(actor, invoiceId);
    if (ledger.rows.some((p) => p.reference === reference)) return;
    await payments.recordPayment(
      actor,
      invoiceId,
      PaymentInputSchema.parse({
        kind: "PAYMENT",
        paymentDate,
        amountApplied,
        tdsDeducted,
        bankFees: "0.00",
        paymentMethodProfileId: bank.id,
        reference,
      }),
    );
  };

  // Paid in full (inter-state, IGST)
  const inv1 = await ensureInvoice("DEMO-01", {
    clientId: northwind.id,
    issueDate: "2026-06-02",
    dueDate: "2026-06-17",
    items: [
      line(workshop, "Product discovery workshop", "DAY", "2", "45000.00"),
      line(design, "UI design", "HOUR", "24", "2500.00"),
    ],
    issue: true,
  });
  await pay(inv1.id, "2026-06-15", inv1.total, "15000.00", "NEFT 2026061500123");

  // Overdue, credited in part (intra-state, CGST + SGST)
  const inv2 = await ensureInvoice("DEMO-02", {
    clientId: brightline.id,
    issueDate: "2026-05-05",
    dueDate: "2026-05-20",
    items: [
      line(usability, "Usability test", "FIXED", "1", "35000.00"),
      line(design, "UI design", "HOUR", "12", "2500.00"),
    ],
    issue: true,
  });

  // Sent, export under LUT in EUR
  const inv3 = await ensureInvoice("DEMO-03", {
    clientId: contoso.id,
    issueDate: "2026-09-01",
    dueDate: "2026-10-31",
    currency: "EUR",
    fxRateToBase: "90.25",
    items: [line(design, "UI design", "HOUR", "40", "28.00", "0")],
    notes: "Supply meant for export under LUT without payment of IGST.",
    issue: true,
  });
  if (!inv3.sentAt) await invoices.markSent(actor, inv3.id);

  // Partially paid, with a discount, rounding and a product line: the invoice page screenshots
  const inv4 = await ensureInvoice("DEMO-04", {
    clientId: northwind.id,
    issueDate: "2026-10-06",
    dueDate: "2026-10-21",
    items: [
      line(workshop, "Product discovery workshop", "DAY", "1", "45000.00"),
      line(design, "UI design", "HOUR", "16", "2500.00"),
      {
        description: "Design system starter kit",
        unitType: "UNIT",
        quantity: "1",
        unitPrice: "12000.00",
        taxRate: "18",
        sacHsnCode: "998314",
        productId: kit.id,
        sku: "KIT-UX-01",
      },
    ],
    discount: { type: "PERCENT", value: "5" },
    roundingAdjustment: "0.30",
    issue: true,
  });
  await pay(inv4.id, "2026-10-12", "40000.00", "4000.00", "UPI 2026101200987");

  // Overdue, untouched
  await ensureInvoice("DEMO-05", {
    clientId: brightline.id,
    issueDate: "2026-08-18",
    dueDate: "2026-09-02",
    items: [line(design, "UI design", "HOUR", "30", "2500.00")],
    issue: true,
  });

  // A draft still in the builder
  const draft = await ensureInvoice("DEMO-06", {
    clientId: contoso.id,
    issueDate: "2026-10-14",
    dueDate: "2026-11-13",
    currency: "EUR",
    fxRateToBase: "90.40",
    items: [line(workshop, "Product discovery workshop", "DAY", "2", "500.00", "0")],
    issue: false,
  });

  // A credit note against the overdue invoice
  let cn = await prisma.creditNote.findFirst({
    where: { invoiceId: inv2.id },
    select: { id: true, status: true },
  });
  if (!cn) {
    const created = await creditNotes.createCreditNoteDraft(
      actor,
      CreditNoteInputSchema.parse({
        invoiceId: inv2.id,
        reason: "Two usability sessions cancelled by the client",
        subtotal: "14000.00",
        issueDate: "2026-06-01",
      }),
    );
    cn = { id: created.id, status: created.status };
  }
  if (cn.status === "DRAFT") await creditNotes.issueCreditNote(actor, cn.id);

  // An open share link on the partially paid invoice
  const links = await shares.listShareLinks(actor, "INVOICE", inv4.id);
  const open = links.find((l) => !l.revokedAt && !l.protected);
  const shareUrl = open
    ? open.url
    : (await shares.createShareLink(actor, { kind: "INVOICE", id: inv4.id })).url;

  return {
    profileId: profile.id,
    clientId: northwind.id,
    invoiceId: inv4.id,
    draftInvoiceId: draft.id,
    creditNoteId: cn.id,
    shareUrl,
  };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) {
  seedDemo()
    .then((ids) => {
      console.log(JSON.stringify(ids, null, 2));
      process.exit(0);
    })
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
