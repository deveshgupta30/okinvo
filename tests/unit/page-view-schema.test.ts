import { describe, expect, it } from "vitest";
import { PageViewBodySchema } from "@/lib/schemas/page-view";

/** Review finding 3: the beacon posts the client-side pathname; only a path is accepted. */
describe("PageViewBodySchema", () => {
  it("accepts an app path", () => {
    expect(PageViewBodySchema.parse({ path: "/invoices/abc" })).toEqual({ path: "/invoices/abc" });
  });
  it("refuses anything that is not a root-relative path, or too long", () => {
    expect(PageViewBodySchema.safeParse({ path: "https://evil.example/x" }).success).toBe(false);
    expect(PageViewBodySchema.safeParse({ path: "invoices" }).success).toBe(false);
    expect(PageViewBodySchema.safeParse({ path: "//evil.example" }).success).toBe(false);
    expect(PageViewBodySchema.safeParse({ path: `/${"a".repeat(300)}` }).success).toBe(false);
    expect(PageViewBodySchema.safeParse({}).success).toBe(false);
  });
});
