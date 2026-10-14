import type { TemplateConfig, TemplateId } from "@/lib/schemas";
import { isRtl } from "@/lib/i18n/languages";
import { fontFamily } from "../fonts/catalog";

/** Points per millimetre (PDF user units). */
export const PT_PER_MM = 72 / 25.4;

export const PAPER: Record<TemplateConfig["paper"]["size"], { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

/** sRGB channel to linear light (WCAG 2 relative luminance). */
function linear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Which text colour reads better on a band of this colour: dark text when its contrast against
 * black beats its contrast against white (relative luminance ≥ 0.179), light text otherwise.
 */
export function textOnBand(hex: string): "light" | "dark" {
  const [r, g, b] = rgb(hex);
  const l = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return l >= 0.179 ? "dark" : "light";
}

/** A pale tint of a colour: the colour blended into white at `amount` (0–1). */
export function tintOf(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const mix = (c: number) => Math.round(255 - (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

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
  /** Minimal: no rules or boxes, lighter labels, more air. */
  minimal: boolean;
  /** Modern: parties, table header and totals sit on a pale accent tint. */
  tinted: boolean;
  tint: string;
  headerStyle: TemplateConfig["header"]["style"];
  headerColor: string;
  /** Band / image height in points. */
  headerHeight: number;
  headerImageOpacity: number;
  /** Colour family of the identity text printed on the band. */
  headerText: "light" | "dark";
  logoHeight: number;
  logoAlign: TemplateConfig["logo"]["position"];
  qrPosition: TemplateConfig["qr"]["position"];
  pageNumbers: boolean;
  wordsPosition: TemplateConfig["totals"]["amountInWords"];
  /** Right-to-left document language (spec §9c): text columns align right, the table mirrors. */
  rtl: boolean;
}

/** Derives every number and colour both renderers use from the template config (R2: variants). */
export function templateStyle(config: TemplateConfig, locale?: string): TemplateStyle {
  const variant = config.templateId;
  const minimal = variant === "minimal";
  const tinted = variant === "modern";
  const headerStyle =
    config.header.style === "none" && (variant === "letterhead" || variant === "modern")
      ? "band"
      : config.header.style;
  const headerText =
    config.header.text !== "auto"
      ? config.header.text
      : headerStyle === "band"
        ? textOnBand(config.header.color)
        : "dark";
  return {
    variant,
    accent: config.colors.accent,
    text: config.colors.text,
    muted: minimal ? "#8b919c" : "#6b7280",
    hairline: variant === "classic" ? "#9ca3af" : minimal ? "#eef0f3" : "#e5e7eb",
    zebra: "#f5f6f8",
    heading: fontFamily(config.font.heading).family,
    body: fontFamily(config.font.body).family,
    paper: PAPER[config.paper.size],
    margin: config.paper.margins === "narrow" ? 24 : 40,
    base: variant === "compact" ? 8 : variant === "classic" ? 9 : 9.5,
    dense: variant === "compact",
    tableBorders: variant === "classic",
    boxedTotals: variant === "classic",
    accentRule: variant === "ledger",
    tableStyle: config.table.style,
    minimal,
    tinted,
    tint: tintOf(config.colors.accent, 0.09),
    headerStyle,
    headerColor: config.header.color,
    headerHeight: config.header.heightMm * PT_PER_MM,
    headerImageOpacity: config.header.imageOpacity,
    headerText,
    logoHeight: config.logo.heightMm * PT_PER_MM,
    logoAlign: config.logo.position,
    qrPosition: config.qr.position,
    pageNumbers: config.pageNumbers,
    wordsPosition: config.totals.amountInWords,
    rtl: locale !== undefined && isRtl(locale),
  };
}

/** Splits "₹1,234.00" / "INR 1,234.00" / "$1,234.00" into a symbol run and the numeric rest. */
export function splitCurrency(s: string): { prefix: string; number: string; suffix: string } {
  const m = /^([^\d\-−+]*)(.*?)([^\d.,]*)$/.exec(s);
  if (!m) return { prefix: "", number: s, suffix: "" };
  return { prefix: m[1] ?? "", number: m[2] ?? "", suffix: m[3] ?? "" };
}
