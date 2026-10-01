import { describe, expect, it } from "vitest";
import { pickerSubtotal } from "@/lib/credit-notes/picker";

const items = [
  { position: 1, lineSubtotal: "10000.00" },
  { position: 2, lineSubtotal: "333.33" },
  { position: 3, lineSubtotal: "5000.00" },
];

describe("pickerSubtotal", () => {
  it("adds whole lines and percentages of lines, rounded to the currency", () => {
    expect(
      pickerSubtotal(
        items,
        [
          { position: 1, mode: "whole" },
          { position: 2, mode: "percent", percent: "50" },
          { position: 3, mode: "percent", percent: "10" },
        ],
        "INR",
      ),
    ).toBe("10666.67");
  });
  it("ignores unknown positions and clamps percentages to 0–100", () => {
    expect(pickerSubtotal(items, [{ position: 9, mode: "whole" }], "INR")).toBe("0.00");
    expect(pickerSubtotal(items, [{ position: 1, mode: "percent", percent: "150" }], "INR")).toBe(
      "10000.00",
    );
    expect(pickerSubtotal(items, [{ position: 1, mode: "percent", percent: "-5" }], "INR")).toBe(
      "0.00",
    );
  });
});
