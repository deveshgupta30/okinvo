import type { TemplateConfig, TemplateId } from "@/lib/schemas";

/** Points per millimetre (PDF user units). */
export const PT_PER_MM = 72 / 25.4;

export const PAPER: Record<TemplateConfig["paper"]["size"], { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

export const FAMILIES = {
  inter: { heading: "Inter", body: "Inter" },
  "ibm-plex-sans": { heading: "IBM Plex Sans", body: "IBM Plex Sans" },
  "source-serif-4+inter": { heading: "Source Serif 4", body: "Inter" },
} as const;

/** The face that carries ₹ and other currency symbols (Inter latin-ext). */
export const SYMBOL_FAMILY = "Symbols";

export interface TemplateStyle {
  variant: TemplateId;
  accent: string;
  text: string;
  muted: string;
  hairline: string;
  zebra: string;
  heading: string;
  body: string;
  paper: { width: number; height: number };
  margin: number;
  base: number;
  dense: boolean;
  tableBorders: boolean;
  boxedTotals: boolean;
  accentRule: boolean;
  tableStyle: TemplateConfig["table"]["style"];
  logoHeight: number;
  logoAlign: TemplateConfig["logo"]["position"];
  qrPosition: TemplateConfig["qr"]["position"];
  pageNumbers: boolean;
  wordsPosition: TemplateConfig["totals"]["amountInWords"];
}

/** Derives every number and colour both renderers use from the template config (R2: variants). */
export function templateStyle(config: TemplateConfig): TemplateStyle {
  const variant = config.templateId;
  const fam = FAMILIES[config.font];
  return {
    variant,
    accent: config.colors.accent,
    text: config.colors.text,
    muted: "#6b7280",
    hairline: variant === "classic" ? "#9ca3af" : "#e5e7eb",
    zebra: "#f5f6f8",
    heading: fam.heading,
    body: fam.body,
    paper: PAPER[config.paper.size],
    margin: config.paper.margins === "narrow" ? 24 : 40,
    base: variant === "compact" ? 8 : variant === "classic" ? 9 : 9.5,
    dense: variant === "compact",
    tableBorders: variant === "classic",
    boxedTotals: variant === "classic",
    accentRule: variant === "ledger",
    tableStyle: config.table.style,
    logoHeight: config.logo.heightMm * PT_PER_MM,
    logoAlign: config.logo.position,
    qrPosition: config.qr.position,
    pageNumbers: config.pageNumbers,
    wordsPosition: config.totals.amountInWords,
  };
}

/** Splits "₹1,234.00" / "INR 1,234.00" / "$1,234.00" into a symbol run and the numeric rest. */
export function splitCurrency(s: string): { prefix: string; number: string; suffix: string } {
  const m = /^([^\d\-−+]*)(.*?)([^\d.,]*)$/.exec(s);
  if (!m) return { prefix: "", number: s, suffix: "" };
  return { prefix: m[1] ?? "", number: m[2] ?? "", suffix: m[3] ?? "" };
}
