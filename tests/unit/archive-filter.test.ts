import { describe, expect, it } from "vitest";
import { ARCHIVABLE_MODELS, withArchiveFilter } from "@/lib/db-archive";

describe("withArchiveFilter", () => {
  it("adds archivedAt: null to archivable models when the caller did not mention it", () => {
    expect(withArchiveFilter("Client", { where: { displayName: "x" } })).toEqual({
      where: { displayName: "x", archivedAt: null },
    });
    expect(withArchiveFilter("IssuerProfile", {})).toEqual({ where: { archivedAt: null } });
  });
  it("respects an explicit archivedAt filter, including the include-all form", () => {
    expect(withArchiveFilter("Client", { where: { archivedAt: {} } })).toEqual({
      where: { archivedAt: {} },
    });
    expect(withArchiveFilter("Client", { where: { archivedAt: { not: null } } })).toEqual({
      where: { archivedAt: { not: null } },
    });
  });
  it("leaves non-archivable models alone", () => {
    expect(withArchiveFilter("Invoice", { where: { status: "DRAFT" } })).toEqual({
      where: { status: "DRAFT" },
    });
  });
  it("names exactly the five archivable aggregates", () => {
    expect([...ARCHIVABLE_MODELS].sort()).toEqual([
      "Client",
      "IssuerProfile",
      "PaymentMethodProfile",
      "Product",
      "ServiceItem",
    ]);
  });
});
