import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABELS,
  DEFAULT_TEMPLATE_CONFIG,
  LABEL_KEYS,
  TEMPLATE_IDS,
  TemplateConfigSchema,
  mergeTemplateConfig,
  resolveLabels,
  type TemplateConfig,
} from "@/lib/schemas";

const issuePaths = (input: unknown): string[] => {
  const r = TemplateConfigSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.map(String).join("."));
};

const withPatch = (patch: (c: TemplateConfig) => void): TemplateConfig => {
  const copy = structuredClone(DEFAULT_TEMPLATE_CONFIG);
  patch(copy);
  return copy;
};

describe("TEMPLATE_IDS / LABEL_KEYS", () => {
  it("lists the three v1 templates and the three v1.1 additions", () => {
    expect([...TEMPLATE_IDS]).toEqual([
      "ledger",
      "classic",
      "compact",
      "minimal",
      "letterhead",
      "modern",
    ]);
  });
  it("lists the 29 fixed-string label keys from the plan", () => {
    expect(LABEL_KEYS).toHaveLength(29);
    expect(LABEL_KEYS[0]).toBe("billTo");
    expect(LABEL_KEYS[LABEL_KEYS.length - 1]).toBe("signature");
    expect(new Set(LABEL_KEYS).size).toBe(LABEL_KEYS.length);
  });
});

describe("DEFAULT_TEMPLATE_CONFIG", () => {
  it("satisfies the schema unchanged", () => {
    expect(TemplateConfigSchema.parse(DEFAULT_TEMPLATE_CONFIG)).toEqual(DEFAULT_TEMPLATE_CONFIG);
  });
  it("holds the documented defaults", () => {
    expect(DEFAULT_TEMPLATE_CONFIG).toEqual({
      templateId: "ledger",
      paper: { size: "A4", margins: "normal" },
      colors: { accent: "#5e6ad2", text: "#1a1a1a" },
      font: { heading: "inter", body: "inter" },
      header: { style: "none", color: "#5e6ad2", imageOpacity: 1, heightMm: 32, text: "auto" },
      logo: { position: "left", heightMm: 16 },
      title: { mode: "auto" },
      labels: {},
      table: { style: "ruled" },
      totals: {
        showSubtotal: true,
        showDiscount: true,
        showTaxLines: true,
        showTdsExpected: true,
        showRounding: true,
        amountInWords: "below-total",
      },
      text: { draftWatermark: "DRAFT — not a tax invoice" },
      qr: { position: "footer" },
      pageNumbers: true,
    });
  });
  it("round-trips through JSON (export / import)", () => {
    expect(TemplateConfigSchema.parse(JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_CONFIG)))).toEqual(
      DEFAULT_TEMPLATE_CONFIG,
    );
  });
});

describe("TemplateConfigSchema", () => {
  it("accepts every enum value and the optional text fields", () => {
    const full = withPatch((c) => {
      c.templateId = "classic";
      c.paper = { size: "LETTER", margins: "narrow" };
      c.font = { heading: "source-serif-4", body: "inter" };
      c.logo = { position: "center", heightMm: 40 };
      c.title = { mode: "custom", custom: "BILL OF SUPPLY" };
      c.labels = { billTo: "Invoice to", amountDue: "Balance" };
      c.table = { style: "zebra" };
      c.totals.amountInWords = "footer";
      c.text = {
        headerNote: "Thank you for your business.",
        footer: "Registered office: 12 MG Road",
        signatureCaption: "For okinvo",
        draftWatermark: "DRAFT",
      };
      c.qr = { position: "beside-totals" };
      c.pageNumbers = false;
    });
    expect(TemplateConfigSchema.parse(full)).toEqual(full);
  });

  it("rejects a malformed accent colour", () => {
    expect(issuePaths(withPatch((c) => (c.colors.accent = "#12345")))).toContain("colors.accent");
    expect(issuePaths(withPatch((c) => (c.colors.text = "red")))).toContain("colors.text");
    expect(issuePaths(withPatch((c) => (c.colors.text = "#1a1a1a; color: red")))).toContain(
      "colors.text",
    );
  });

  it("rejects a label longer than 40 characters and an unknown label key", () => {
    expect(issuePaths(withPatch((c) => (c.labels = { billTo: "x".repeat(41) })))).toContain(
      "labels.billTo",
    );
    // Zod 4 reports an unknown key of a partialRecord as `unrecognized_keys` at the record itself.
    expect(issuePaths({ ...DEFAULT_TEMPLATE_CONFIG, labels: { notAKey: "x" } })).toContain(
      "labels",
    );
  });

  it("bounds the header image opacity and height, and takes an asset id", () => {
    expect(issuePaths(withPatch((c) => (c.header.imageOpacity = 1.5)))).toContain(
      "header.imageOpacity",
    );
    expect(issuePaths(withPatch((c) => (c.header.imageOpacity = -0.1)))).toContain(
      "header.imageOpacity",
    );
    expect(issuePaths(withPatch((c) => (c.header.heightMm = 10)))).toContain("header.heightMm");
    expect(issuePaths(withPatch((c) => (c.header.heightMm = 61)))).toContain("header.heightMm");
    const withImage = mergeTemplateConfig({
      header: { style: "image", imageAssetId: "asset-1", imageOpacity: 0.5 },
    });
    expect(withImage.header).toEqual({
      style: "image",
      color: "#5e6ad2",
      imageAssetId: "asset-1",
      imageOpacity: 0.5,
      heightMm: 32,
      text: "auto",
    });
    // v1 snapshots carry no header block at all
    expect(mergeTemplateConfig({ templateId: "classic" }).header.style).toBe("none");
  });

  it("rejects an unknown template id, font, table style, QR position and paper size", () => {
    expect(issuePaths({ ...DEFAULT_TEMPLATE_CONFIG, templateId: "brutalist" })).toContain(
      "templateId",
    );
    expect(issuePaths({ ...DEFAULT_TEMPLATE_CONFIG, font: "comic-sans" })).toContain(
      "font.heading",
    );
    expect(issuePaths({ ...DEFAULT_TEMPLATE_CONFIG, table: { style: "grid" } })).toContain(
      "table.style",
    );
    expect(issuePaths({ ...DEFAULT_TEMPLATE_CONFIG, qr: { position: "top" } })).toContain(
      "qr.position",
    );
    expect(
      issuePaths({ ...DEFAULT_TEMPLATE_CONFIG, paper: { size: "A5", margins: "normal" } }),
    ).toContain("paper.size");
  });

  it("keeps the logo height between 8 and 40 mm", () => {
    expect(issuePaths(withPatch((c) => (c.logo.heightMm = 7)))).toContain("logo.heightMm");
    expect(issuePaths(withPatch((c) => (c.logo.heightMm = 41)))).toContain("logo.heightMm");
    expect(issuePaths(withPatch((c) => (c.logo.heightMm = 8)))).toEqual([]);
  });

  it("caps the free-text fields", () => {
    expect(issuePaths(withPatch((c) => (c.text.draftWatermark = "x".repeat(41))))).toContain(
      "text.draftWatermark",
    );
    expect(issuePaths(withPatch((c) => (c.text.headerNote = "x".repeat(301))))).toContain(
      "text.headerNote",
    );
    expect(issuePaths(withPatch((c) => (c.text.footer = "x".repeat(301))))).toContain(
      "text.footer",
    );
    expect(issuePaths(withPatch((c) => (c.text.signatureCaption = "x".repeat(61))))).toContain(
      "text.signatureCaption",
    );
    expect(
      issuePaths(withPatch((c) => (c.title = { mode: "custom", custom: "x".repeat(41) }))),
    ).toContain("title.custom");
  });

  it("requires custom title text when the title mode is custom", () => {
    expect(issuePaths(withPatch((c) => (c.title = { mode: "custom" })))).toContain("title.custom");
    expect(issuePaths(withPatch((c) => (c.title = { mode: "custom", custom: "  " })))).toContain(
      "title.custom",
    );
    expect(issuePaths(withPatch((c) => (c.title = { mode: "auto" })))).toEqual([]);
  });

  it("rejects a non-boolean totals flag", () => {
    expect(
      issuePaths({
        ...DEFAULT_TEMPLATE_CONFIG,
        totals: { ...DEFAULT_TEMPLATE_CONFIG.totals, showRounding: "no" },
      }),
    ).toContain("totals.showRounding");
  });
});

describe("mergeTemplateConfig", () => {
  it("returns the defaults for {}, undefined and null", () => {
    expect(mergeTemplateConfig({})).toEqual(DEFAULT_TEMPLATE_CONFIG);
    expect(mergeTemplateConfig(undefined)).toEqual(DEFAULT_TEMPLATE_CONFIG);
    expect(mergeTemplateConfig(null)).toEqual(DEFAULT_TEMPLATE_CONFIG);
  });

  it("deep-merges nested groups, keeping sibling defaults", () => {
    const merged = mergeTemplateConfig({
      colors: { accent: "#000000" },
      totals: { showRounding: false },
    });
    expect(merged.colors).toEqual({ accent: "#000000", text: "#1a1a1a" });
    expect(merged.totals).toEqual({ ...DEFAULT_TEMPLATE_CONFIG.totals, showRounding: false });
    expect(merged.templateId).toBe("ledger");
  });

  it("merges labels and text without dropping the watermark default", () => {
    const merged = mergeTemplateConfig({
      labels: { billTo: "Invoice to" },
      text: { footer: "Thanks" },
    });
    expect(merged.labels).toEqual({ billTo: "Invoice to" });
    expect(merged.text).toEqual({ draftWatermark: "DRAFT — not a tax invoice", footer: "Thanks" });
  });

  it("does not mutate the defaults", () => {
    const before = structuredClone(DEFAULT_TEMPLATE_CONFIG);
    mergeTemplateConfig({ labels: { billTo: "X" }, colors: { accent: "#000000" } });
    expect(DEFAULT_TEMPLATE_CONFIG).toEqual(before);
  });

  it("throws on invalid input", () => {
    expect(() => mergeTemplateConfig({ colors: { accent: "red" } })).toThrow();
    expect(() => mergeTemplateConfig({ templateId: "brutalist" })).toThrow();
    expect(() => mergeTemplateConfig("ledger")).toThrow();
    expect(() => mergeTemplateConfig({ title: { mode: "custom" } })).toThrow();
  });
});

describe("DEFAULT_LABELS / resolveLabels", () => {
  it("provides a non-empty default for every label key", () => {
    for (const key of LABEL_KEYS) {
      expect(DEFAULT_LABELS[key].length, key).toBeGreaterThan(0);
      expect(DEFAULT_LABELS[key].length, key).toBeLessThanOrEqual(40);
    }
    expect(Object.keys(DEFAULT_LABELS).sort()).toEqual([...LABEL_KEYS].sort());
    expect(DEFAULT_LABELS.billTo).toBe("Bill to");
    expect(DEFAULT_LABELS.amountDue).toBe("Amount due");
    expect(DEFAULT_LABELS.paymentDetails).toBe("Payment details");
  });

  it("returns the defaults when no overrides are set", () => {
    expect(resolveLabels(DEFAULT_TEMPLATE_CONFIG)).toEqual(DEFAULT_LABELS);
  });

  it("overrides only the given keys", () => {
    const labels = resolveLabels(
      mergeTemplateConfig({ labels: { billTo: "Invoice to", total: "Grand total" } }),
    );
    expect(labels.billTo).toBe("Invoice to");
    expect(labels.total).toBe("Grand total");
    const { billTo: _b, total: _t, ...rest } = labels;
    void _b;
    void _t;
    const { billTo: _db, total: _dt, ...defaultsRest } = DEFAULT_LABELS;
    void _db;
    void _dt;
    expect(rest).toEqual(defaultsRest);
  });

  it("returns a fresh object each time", () => {
    const a = resolveLabels(DEFAULT_TEMPLATE_CONFIG);
    a.billTo = "mutated";
    expect(resolveLabels(DEFAULT_TEMPLATE_CONFIG).billTo).toBe("Bill to");
    expect(DEFAULT_LABELS.billTo).toBe("Bill to");
  });
});
