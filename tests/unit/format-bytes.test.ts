import { describe, expect, it } from "vitest";
import { formatKilobytes } from "@/lib/format";

/** Review finding 12: the receipts list showed a bare English "KB". */
describe("formatKilobytes", () => {
  it("rounds to whole kilobytes, at least one, in the locale's unit style", () => {
    expect(formatKilobytes(1, "en-US")).toBe("1 kB");
    expect(formatKilobytes(1536, "en-US")).toBe("2 kB");
    expect(formatKilobytes(2_000_000, "en-US")).toBe("1,953 kB");
    expect(formatKilobytes(2_000_000, "de")).toBe("1.953 kB");
  });
});
