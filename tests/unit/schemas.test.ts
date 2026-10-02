import { describe, expect, it } from "vitest";
import {
  AddressSchema,
  ClientSnapshotSchema,
  CreditNoteSnapshotSchema,
  CurrencySchema,
  DEFAULT_DISPLAY_CONFIG,
  DisplayConfigSchema,
  EmailDefaultsSchema,
  IssuerSnapshotSchema,
  PaymentMethodDetailsSchema,
  PaymentMethodsSnapshotSchema,
  SmtpConfigSchema,
  countryName,
  formatAddressLines,
  mergeDisplayConfig,
  parseEmailList,
  paymentMethodLines,
  type Address,
  type DisplayConfig,
  type PaymentMethodDetails,
} from "@/lib/schemas";

const issuePaths = (schema: { safeParse: (v: unknown) => unknown }, input: unknown): string[] => {
  const r = schema.safeParse(input) as
    { success: true } | { success: false; error: { issues: { path: PropertyKey[] }[] } };
  return r.success ? [] : r.error.issues.map((i) => i.path.map(String).join("."));
};

// ───────────────────────── address ─────────────────────────

describe("AddressSchema", () => {
  const full = {
    line1: "  12 MG Road ",
    line2: "Floor 3",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    countryCode: "in",
  };

  it("accepts a full address, trimming text and upper-casing the country code", () => {
    const a = AddressSchema.parse(full);
    expect(a.line1).toBe("12 MG Road");
    expect(a.countryCode).toBe("IN");
  });

  it("accepts the minimal address (line1, city, country)", () => {
    expect(() =>
      AddressSchema.parse({ line1: "1 High St", city: "London", countryCode: "GB" }),
    ).not.toThrow();
  });

  it("rejects a blank line1 and a non-alpha-2 country code", () => {
    expect(issuePaths(AddressSchema, { ...full, line1: "   " })).toContain("line1");
    expect(issuePaths(AddressSchema, { ...full, countryCode: "IND" })).toContain("countryCode");
    expect(issuePaths(AddressSchema, { ...full, countryCode: "1A" })).toContain("countryCode");
  });

  it("rejects over-long fields", () => {
    expect(issuePaths(AddressSchema, { ...full, line1: "x".repeat(121) })).toContain("line1");
    expect(issuePaths(AddressSchema, { ...full, postalCode: "1".repeat(21) })).toContain(
      "postalCode",
    );
  });
});

describe("formatAddressLines", () => {
  it("prints line1, line2, 'city, state postalCode' and the English country name", () => {
    const a: Address = {
      line1: "12 MG Road",
      line2: "Floor 3",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
      countryCode: "IN",
    };
    expect(formatAddressLines(a)).toEqual([
      "12 MG Road",
      "Floor 3",
      "Bengaluru, Karnataka 560001",
      "India",
    ]);
  });

  it("skips empty and missing parts", () => {
    const a: Address = { line1: "1 High St", line2: "", city: "London", countryCode: "GB" };
    expect(formatAddressLines(a)).toEqual(["1 High St", "London", "United Kingdom"]);
    expect(
      formatAddressLines({
        line1: "1 Main St",
        city: "Austin",
        postalCode: "73301",
        countryCode: "US",
      }),
    ).toEqual(["1 Main St", "Austin 73301", "United States"]);
  });

  it("falls back to the code when the region is unknown to Intl", () => {
    // QZ is a reserved (unassigned) code that ICU leaves unnamed; ZZ would print "Unknown Region".
    expect(formatAddressLines({ line1: "x", city: "y", countryCode: "QZ" })).toEqual([
      "x",
      "y",
      "QZ",
    ]);
    expect(countryName("in")).toBe("India");
    expect(countryName("1A")).toBe("1A"); // ill-formed: Intl throws, we return the input
  });
});

// ───────────────────────── display config ─────────────────────────

describe("DisplayConfigSchema", () => {
  it("has defaults that satisfy the schema: all true except the four documented keys", () => {
    expect(DisplayConfigSchema.parse(DEFAULT_DISPLAY_CONFIG)).toEqual(DEFAULT_DISPLAY_CONFIG);
    const falses: string[] = [];
    for (const [group, flags] of Object.entries(DEFAULT_DISPLAY_CONFIG)) {
      for (const [key, value] of Object.entries(flags)) if (!value) falses.push(`${group}.${key}`);
    }
    expect(falses.sort()).toEqual(
      [
        "client.showShippingAddress",
        "document.showTdsBreakdown",
        "issuer.showPan",
        "issuer.showStamp",
      ].sort(),
    );
  });

  it("carries the v1 §6 fields plus the six document.* additions", () => {
    expect(Object.keys(DEFAULT_DISPLAY_CONFIG.issuer).sort()).toEqual(
      [
        "showLogo",
        "showTradeName",
        "showDesignation",
        "showEmail",
        "showPhone",
        "showWebsite",
        "showFullAddress",
        "showPan",
        "showGstin",
        "showCin",
        "showLut",
        "showSignature",
        "showStamp",
      ].sort(),
    );
    expect(Object.keys(DEFAULT_DISPLAY_CONFIG.client).sort()).toEqual(
      [
        "showContactPerson",
        "showEmail",
        "showPhone",
        "showBillingAddress",
        "showShippingAddress",
        "showTaxIdentifier",
        "showPlaceOfSupply",
      ].sort(),
    );
    expect(Object.keys(DEFAULT_DISPLAY_CONFIG.document).sort()).toEqual(
      [
        "showDueDate",
        "showPaymentTerms",
        "showSacCodeColumn",
        "showQuantityColumn",
        "showUnitPriceColumn",
        "showTaxColumn",
        "showTdsBreakdown",
        "showQrVerification",
        "showNotes",
        "showTerms",
        "showReplacesReference",
        "showAmountInWords",
        "showPlaceOfSupply",
        "showSupplyStatement",
        "showRoundingLine",
        "showSku",
      ].sort(),
    );
  });

  it("rejects a non-boolean flag and a missing group", () => {
    const bad = {
      ...DEFAULT_DISPLAY_CONFIG,
      issuer: { ...DEFAULT_DISPLAY_CONFIG.issuer, showPan: "yes" },
    };
    expect(issuePaths(DisplayConfigSchema, bad)).toContain("issuer.showPan");
    const { document: _omit, ...withoutDocument } = DEFAULT_DISPLAY_CONFIG;
    void _omit;
    expect(issuePaths(DisplayConfigSchema, withoutDocument)).toContain("document");
  });
});

describe("mergeDisplayConfig", () => {
  it("keeps every other default when one flag is overridden", () => {
    const merged = mergeDisplayConfig({ issuer: { showPan: true } });
    expect(merged.issuer.showPan).toBe(true);
    expect(merged.issuer.showStamp).toBe(false);
    expect(merged.issuer.showLogo).toBe(true);
    expect(merged.client).toEqual(DEFAULT_DISPLAY_CONFIG.client);
    expect(merged.document).toEqual(DEFAULT_DISPLAY_CONFIG.document);
  });

  it("returns the defaults for {}, undefined and null", () => {
    expect(mergeDisplayConfig({})).toEqual(DEFAULT_DISPLAY_CONFIG);
    expect(mergeDisplayConfig(undefined)).toEqual(DEFAULT_DISPLAY_CONFIG);
    expect(mergeDisplayConfig(null)).toEqual(DEFAULT_DISPLAY_CONFIG);
  });

  it("does not mutate the defaults or the input", () => {
    const before = structuredClone(DEFAULT_DISPLAY_CONFIG);
    const input = { document: { showNotes: false } };
    mergeDisplayConfig(input);
    expect(DEFAULT_DISPLAY_CONFIG).toEqual(before);
    expect(input).toEqual({ document: { showNotes: false } });
  });

  it("throws on invalid input instead of silently keeping the default", () => {
    expect(() => mergeDisplayConfig({ document: { showNotes: "no" } })).toThrow();
    expect(() => mergeDisplayConfig("all")).toThrow();
    expect(() => mergeDisplayConfig({ issuer: [true] })).toThrow();
  });

  it("produces a value assignable to DisplayConfig", () => {
    const value: DisplayConfig = mergeDisplayConfig({ client: { showEmail: false } });
    expect(value.client.showEmail).toBe(false);
  });
});

// ───────────────────────── payment method details ─────────────────────────

describe("PaymentMethodDetailsSchema", () => {
  it("accepts a bank transfer with any subset of fields and rejects an empty one", () => {
    const ok = PaymentMethodDetailsSchema.parse({
      type: "BANK_TRANSFER",
      accountHolder: "Devesh Gupta",
      accountNumber: "1234567890",
      ifsc: "HDFC0001234",
    });
    expect(ok.type).toBe("BANK_TRANSFER");
    expect(() => PaymentMethodDetailsSchema.parse({ type: "BANK_TRANSFER" })).toThrow(
      /at least one/i,
    );
    expect(() =>
      PaymentMethodDetailsSchema.parse({ type: "BANK_TRANSFER", accountHolder: "  ", iban: "" }),
    ).toThrow(/at least one/i);
  });

  it("caps bank fields at 64 characters", () => {
    expect(
      issuePaths(PaymentMethodDetailsSchema, {
        type: "BANK_TRANSFER",
        accountNumber: "1".repeat(65),
      }),
    ).toContain("accountNumber");
  });

  it("requires a well-formed UPI VPA", () => {
    expect(PaymentMethodDetailsSchema.parse({ type: "UPI", vpa: "devesh@okhdfcbank" }).type).toBe(
      "UPI",
    );
    expect(
      PaymentMethodDetailsSchema.parse({
        type: "UPI",
        vpa: "dev.gupta-1@upi",
        payeeName: "Devesh",
      }),
    ).toBeTruthy();
    expect(issuePaths(PaymentMethodDetailsSchema, { type: "UPI", vpa: "x" })).toContain("vpa");
    expect(issuePaths(PaymentMethodDetailsSchema, { type: "UPI" })).toContain("vpa");
  });

  it("accepts WISE / REVOLUT / PAYPAL with an email or handle and optional bank fields", () => {
    expect(
      PaymentMethodDetailsSchema.parse({ type: "PAYPAL", accountEmail: "pay@example.com" }).type,
    ).toBe("PAYPAL");
    expect(
      PaymentMethodDetailsSchema.parse({ type: "REVOLUT", accountEmail: "@devesh" }).type,
    ).toBe("REVOLUT");
    expect(
      PaymentMethodDetailsSchema.parse({
        type: "WISE",
        accountEmail: "me@wise.com",
        iban: "GB33BUKB20201555555555",
      }),
    ).toBeTruthy();
    expect(
      issuePaths(PaymentMethodDetailsSchema, { type: "WISE", accountEmail: "x".repeat(121) }),
    ).toContain("accountEmail");
  });

  it("requires 1–10 custom lines of at most 120 characters", () => {
    expect(
      PaymentMethodDetailsSchema.parse({
        type: "CUSTOM",
        lines: ["Pay by cheque", "Payable to okinvo"],
      }),
    ).toBeTruthy();
    expect(issuePaths(PaymentMethodDetailsSchema, { type: "CUSTOM", lines: [] })).toContain(
      "lines",
    );
    expect(
      issuePaths(PaymentMethodDetailsSchema, { type: "CUSTOM", lines: Array(11).fill("x") }),
    ).toContain("lines");
    expect(
      issuePaths(PaymentMethodDetailsSchema, { type: "CUSTOM", lines: ["x".repeat(121)] }),
    ).toContain("lines.0");
  });

  it("rejects an unknown type", () => {
    expect(issuePaths(PaymentMethodDetailsSchema, { type: "CRYPTO", lines: ["x"] })).toContain(
      "type",
    );
  });
});

describe("paymentMethodLines", () => {
  it("prints bank fields in a fixed order, skipping absent and blank ones", () => {
    const d: PaymentMethodDetails = {
      type: "BANK_TRANSFER",
      ifsc: "HDFC0001234",
      accountNumber: "1234567890",
      bankName: "",
      accountHolder: "Devesh Gupta",
      swift: "HDFCINBB",
    };
    expect(paymentMethodLines(d)).toEqual([
      { label: "Account holder", value: "Devesh Gupta" },
      { label: "Account number", value: "1234567890" },
      { label: "IFSC", value: "HDFC0001234" },
      { label: "SWIFT/BIC", value: "HDFCINBB" },
    ]);
  });

  it("prints every bank field label when all are present", () => {
    const d: PaymentMethodDetails = {
      type: "BANK_TRANSFER",
      accountHolder: "a",
      accountNumber: "b",
      bankName: "c",
      branch: "d",
      ifsc: "e",
      swift: "f",
      iban: "g",
      routingCode: "h",
    };
    expect(paymentMethodLines(d).map((l) => l.label)).toEqual([
      "Account holder",
      "Account number",
      "Bank name",
      "Branch",
      "IFSC",
      "SWIFT/BIC",
      "IBAN",
      "Routing/sort code",
    ]);
  });

  it("prints the UPI ID and payee name", () => {
    expect(paymentMethodLines({ type: "UPI", vpa: "devesh@upi", payeeName: "Devesh" })).toEqual([
      { label: "UPI ID", value: "devesh@upi" },
      { label: "Payee name", value: "Devesh" },
    ]);
    expect(paymentMethodLines({ type: "UPI", vpa: "devesh@upi" })).toEqual([
      { label: "UPI ID", value: "devesh@upi" },
    ]);
  });

  it("puts the account email first for WISE / REVOLUT / PAYPAL", () => {
    expect(
      paymentMethodLines({
        type: "PAYPAL",
        accountEmail: "pay@example.com",
        accountHolder: "Devesh",
      }),
    ).toEqual([
      { label: "Account email", value: "pay@example.com" },
      { label: "Account holder", value: "Devesh" },
    ]);
  });

  it("prints custom lines verbatim with an empty label", () => {
    expect(
      paymentMethodLines({ type: "CUSTOM", lines: ["Pay by cheque", "Payable to okinvo"] }),
    ).toEqual([
      { label: "", value: "Pay by cheque" },
      { label: "", value: "Payable to okinvo" },
    ]);
  });
});

// ───────────────────────── smtp / email ─────────────────────────

describe("SmtpConfigSchema", () => {
  const base = {
    host: "smtp.example.com",
    port: "587",
    security: "starttls",
    from: "billing@example.com",
  };

  it("accepts a minimal config and coerces the port", () => {
    const c = SmtpConfigSchema.parse(base);
    expect(c.port).toBe(587);
    expect(c.user).toBeUndefined();
  });

  it("accepts the optional fields", () => {
    const c = SmtpConfigSchema.parse({
      ...base,
      user: "billing",
      passwordEnc: "enc:v1:abc",
      fromName: "okinvo billing",
      replyTo: "reply@example.com",
    });
    expect(c.fromName).toBe("okinvo billing");
    expect(c.replyTo).toBe("reply@example.com");
  });

  it("rejects an out-of-range port, a bad security value, bad addresses and a long fromName", () => {
    expect(issuePaths(SmtpConfigSchema, { ...base, port: 70000 })).toContain("port");
    expect(issuePaths(SmtpConfigSchema, { ...base, port: "abc" })).toContain("port");
    expect(issuePaths(SmtpConfigSchema, { ...base, security: "ssl" })).toContain("security");
    expect(issuePaths(SmtpConfigSchema, { ...base, from: "nope" })).toContain("from");
    expect(issuePaths(SmtpConfigSchema, { ...base, replyTo: "nope" })).toContain("replyTo");
    expect(issuePaths(SmtpConfigSchema, { ...base, fromName: "x".repeat(81) })).toContain(
      "fromName",
    );
    expect(issuePaths(SmtpConfigSchema, { ...base, host: "" })).toContain("host");
  });
});

describe("EmailDefaultsSchema", () => {
  it("defaults both lists to empty", () => {
    expect(EmailDefaultsSchema.parse({})).toEqual({ cc: [], bcc: [] });
  });
  it("accepts up to ten valid addresses per list", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `u${i}@example.com`);
    expect(EmailDefaultsSchema.parse({ cc: ten }).cc).toHaveLength(10);
    expect(issuePaths(EmailDefaultsSchema, { cc: [...ten, "u10@example.com"] })).toContain("cc");
    expect(issuePaths(EmailDefaultsSchema, { bcc: ["nope"] })).toContain("bcc.0");
  });
});

describe("parseEmailList", () => {
  it("splits on commas, semicolons and newlines and trims entries", () => {
    expect(parseEmailList("a@x.com; b@y.org\n")).toEqual(["a@x.com", "b@y.org"]);
    expect(parseEmailList(" a@x.com ,\r\n b@y.org ,, c@z.net ")).toEqual([
      "a@x.com",
      "b@y.org",
      "c@z.net",
    ]);
  });
  it("returns an empty list for null, undefined and blank input", () => {
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("  \n ")).toEqual([]);
  });
  it("throws naming the bad entry", () => {
    expect(() => parseEmailList("nope")).toThrow(/"nope"/);
    expect(() => parseEmailList("a@x.com, not an email")).toThrow(/"not an email"/);
  });
});

// ───────────────────────── snapshots ─────────────────────────

const issuer = {
  type: "INDIVIDUAL",
  legalName: "Devesh Gupta",
  tradeName: "okinvo",
  designation: "Consultant",
  email: "devesh@example.com",
  phone: "+91 98765 43210",
  website: "https://example.com",
  addressLines: ["12 MG Road", "Bengaluru, Karnataka 560001", "India"],
  countryCode: "IN",
  stateCode: "KA",
  gstStateCode: "29",
  pan: "ABCDE1234F",
  gstin: "29ABCDE1234F1Z5",
  lutNumber: "AD290326000123X",
  lutFiscalYear: "2026-27",
  logoAssetId: "asset_logo",
  signatureAssetId: "asset_sig",
  locale: "en-IN",
  baseCurrency: "INR",
};

const client = {
  displayName: "Acme Ltd",
  contactPerson: "Jane Doe",
  email: "jane@acme.example",
  billingAddressLines: ["1 High St", "London", "United Kingdom"],
  countryCode: "GB",
  taxIdType: "VAT",
  taxId: "GB123456789",
  paymentTermsDays: 30,
};

describe("IssuerSnapshotSchema", () => {
  it("accepts the fixture", () => {
    const s = IssuerSnapshotSchema.parse(issuer);
    expect(s.baseCurrency).toBe("INR");
    expect(s.addressLines).toHaveLength(3);
  });
  it("accepts the minimal snapshot (display config hid everything optional)", () => {
    expect(
      IssuerSnapshotSchema.parse({
        type: "COMPANY",
        legalName: "Acme Pvt Ltd",
        addressLines: [],
        countryCode: "IN",
        locale: "en-IN",
        baseCurrency: "INR",
      }).type,
    ).toBe("COMPANY");
  });
  it("rejects a three-decimal base currency, an unknown issuer type and a bad GST state code", () => {
    expect(issuePaths(IssuerSnapshotSchema, { ...issuer, baseCurrency: "BHD" })).toContain(
      "baseCurrency",
    );
    expect(issuePaths(IssuerSnapshotSchema, { ...issuer, type: "TRUST" })).toContain("type");
    expect(issuePaths(IssuerSnapshotSchema, { ...issuer, gstStateCode: "2" })).toContain(
      "gstStateCode",
    );
    expect(issuePaths(IssuerSnapshotSchema, { ...issuer, email: "nope" })).toContain("email");
  });
});

describe("ClientSnapshotSchema", () => {
  it("accepts the fixture, with and without a shipping address", () => {
    expect(ClientSnapshotSchema.parse(client).paymentTermsDays).toBe(30);
    expect(
      ClientSnapshotSchema.parse({
        ...client,
        shippingAddressLines: ["Unit 4", "Leeds", "United Kingdom"],
      }).shippingAddressLines,
    ).toHaveLength(3);
  });
  it("rejects negative or fractional payment terms and an unknown tax id type", () => {
    expect(issuePaths(ClientSnapshotSchema, { ...client, paymentTermsDays: -1 })).toContain(
      "paymentTermsDays",
    );
    expect(issuePaths(ClientSnapshotSchema, { ...client, paymentTermsDays: 1.5 })).toContain(
      "paymentTermsDays",
    );
    expect(issuePaths(ClientSnapshotSchema, { ...client, taxIdType: "TIN" })).toContain(
      "taxIdType",
    );
    expect(issuePaths(ClientSnapshotSchema, { ...client, displayName: "" })).toContain(
      "displayName",
    );
  });
});

describe("PaymentMethodsSnapshotSchema", () => {
  const methods = [
    {
      name: "HDFC current account",
      type: "BANK_TRANSFER",
      instructions: "Please quote the invoice number.",
      lines: [
        { label: "Account holder", value: "Devesh Gupta" },
        { label: "IFSC", value: "HDFC0001234" },
      ],
    },
    { name: "UPI", type: "UPI", lines: [{ label: "UPI ID", value: "devesh@upi" }] },
  ];
  it("accepts an ordered list of printable methods", () => {
    expect(PaymentMethodsSnapshotSchema.parse(methods)).toHaveLength(2);
    expect(PaymentMethodsSnapshotSchema.parse([])).toEqual([]);
  });
  it("rejects an unknown type and a line without a value", () => {
    expect(issuePaths(PaymentMethodsSnapshotSchema, [{ ...methods[0], type: "CRYPTO" }])).toContain(
      "0.type",
    );
    expect(
      issuePaths(PaymentMethodsSnapshotSchema, [{ ...methods[1], lines: [{ label: "UPI ID" }] }]),
    ).toContain("0.lines.0.value");
  });
});

describe("CreditNoteSnapshotSchema", () => {
  const snapshot = {
    issuer,
    client,
    invoice: {
      number: "INV/26-27/001",
      issueDate: "2026-06-01",
      currency: "INR",
      total: "11800.00",
      taxRegime: "INDIA_GST",
      placeOfSupply: "Karnataka (29)",
    },
  };
  it("accepts the fixture", () => {
    const s = CreditNoteSnapshotSchema.parse(snapshot);
    expect(s.invoice.number).toBe("INV/26-27/001");
    expect(s.invoice.total).toBe("11800.00");
  });
  it("rejects a bad issue date, a three-decimal currency, a numeric total and an unknown regime", () => {
    const bad = (invoice: Record<string, unknown>) =>
      issuePaths(CreditNoteSnapshotSchema, {
        ...snapshot,
        invoice: { ...snapshot.invoice, ...invoice },
      });
    expect(bad({ issueDate: "2026-13-01" })).toContain("invoice.issueDate");
    expect(bad({ currency: "BHD" })).toContain("invoice.currency");
    expect(bad({ total: 11800 })).toContain("invoice.total");
    expect(bad({ total: "11,800.00" })).toContain("invoice.total");
    expect(bad({ taxRegime: "EU_VAT" })).toContain("invoice.taxRegime");
  });
});

describe("schemas index", () => {
  it("re-exports CurrencySchema", () => {
    expect(CurrencySchema.parse(" inr ")).toBe("INR");
    expect(CurrencySchema.safeParse("BHD").success).toBe(false);
  });
});
