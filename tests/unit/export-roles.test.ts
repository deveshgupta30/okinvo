import { describe, expect, it } from "vitest";
import { DATASET_MIN_ROLE } from "@/lib/exports/roles";
import { DATASET_IDS } from "@/lib/exports/types";

describe("export dataset roles", () => {
  it("names a minimum role for every dataset", () => {
    for (const id of DATASET_IDS)
      expect(["VIEWER", "EDITOR", "OWNER"]).toContain(DATASET_MIN_ROLE[id]);
  });
  it("keeps money movements and tax summaries to editors, registers to everyone", () => {
    expect(DATASET_MIN_ROLE.payments).toBe("EDITOR");
    expect(DATASET_MIN_ROLE["gst-summary"]).toBe("EDITOR");
    expect(DATASET_MIN_ROLE["tds-summary"]).toBe("EDITOR");
    expect(DATASET_MIN_ROLE.invoices).toBe("VIEWER");
    expect(DATASET_MIN_ROLE.clients).toBe("VIEWER");
  });
});
