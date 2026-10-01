import { describe, expect, it } from "vitest";
import { readFlash, withFlash } from "@/lib/flash";

describe("flash messages carried through redirects", () => {
  it("appends an encoded flash to a path and reads it back", () => {
    const href = withFlash("/invoices/abc", { kind: "success", message: "Invoice issued" });
    expect(href.startsWith("/invoices/abc?flash=")).toBe(true);
    expect(readFlash(new URL(href, "http://x").searchParams.get("flash"))).toEqual({
      kind: "success",
      message: "Invoice issued",
    });
  });
  it("keeps existing query parameters", () => {
    const href = withFlash("/invoices?status=PAID", { kind: "error", message: "No" });
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("status")).toBe("PAID");
    expect(readFlash(url.searchParams.get("flash"))?.kind).toBe("error");
  });
  it("ignores garbage and over-long payloads", () => {
    expect(readFlash(null)).toBeNull();
    expect(readFlash("not-json")).toBeNull();
    expect(readFlash(JSON.stringify({ kind: "nope", message: "x" }))).toBeNull();
    expect(readFlash(JSON.stringify({ kind: "info", message: "x".repeat(600) }))).toBeNull();
  });
});
