import { D, roundMoney, sum, toMoneyString } from "@/lib/money";

/** A ticked invoice line: the whole line, or a percentage of it (SPEC §4.9 line picker). */
export interface PickerSelection {
  position: number;
  mode: "whole" | "percent";
  percent?: string;
}

/**
 * Sums the selected lines' subtotals (pre-discount) into a credit amount. The picker only fills
 * the amount field; the server computes tax and enforces the caps at issue time.
 */
export function pickerSubtotal(
  items: { position: number; lineSubtotal: string }[],
  selection: PickerSelection[],
  currency: string,
): string {
  const parts = selection.map((s) => {
    const item = items.find((i) => i.position === s.position);
    if (!item) return D(0);
    const base = D(item.lineSubtotal);
    if (s.mode === "whole") return base;
    const raw = /^-?\d+(\.\d+)?$/.test(s.percent ?? "") ? D(s.percent ?? "0") : D(0);
    const pct = raw.lt(0) ? D(0) : raw.gt(100) ? D(100) : raw;
    return roundMoney(base.mul(pct).div(100), currency);
  });
  return toMoneyString(sum(parts), currency);
}
