import { describe, expect, it } from "vitest";
import { created, list, ok } from "@/lib/api/envelope";
import { apiError } from "@/lib/api/errors";
import { ALLOW_HEADER, disallowedVerb } from "@/lib/api/methods";
import { clampLimit, paginate } from "@/lib/api/pagination";

/** The envelopes, pagination and verb policy of /api/v1 (spec §7.2). */
describe("envelopes", () => {
  it("wraps data, lists carry nextCursor, errors carry a code", async () => {
    const r = ok({ a: 1 });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ data: { a: 1 } });
    const c = created({ id: "x" }, "/api/v1/invoices/x");
    expect(c.status).toBe(201);
    expect(c.headers.get("location")).toBe("/api/v1/invoices/x");
    expect(await list([1, 2], "2").json()).toEqual({ data: [1, 2], nextCursor: "2" });
    const e = apiError("validation", "bad", 400, [{ path: "items", message: "required" }]);
    expect(e.status).toBe(400);
    expect(await e.json()).toEqual({
      error: {
        code: "validation",
        message: "bad",
        issues: [{ path: "items", message: "required" }],
      },
    });
    expect(await apiError("not_found", "nope", 404).json()).toEqual({
      error: { code: "not_found", message: "nope" },
    });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: `i${i}` }));
  it("pages by id cursor and says when there is more", () => {
    const p1 = paginate(items, { limit: 3 });
    expect(p1.items.map((i) => i.id)).toEqual(["i0", "i1", "i2"]);
    expect(p1.nextCursor).toBe("i2");
    const p2 = paginate(items, { limit: 3, cursor: p1.nextCursor });
    expect(p2.items.map((i) => i.id)).toEqual(["i3", "i4", "i5"]);
    const p3 = paginate(items, { limit: 3, cursor: p2.nextCursor });
    expect(p3.items.map((i) => i.id)).toEqual(["i6"]);
    expect(p3.nextCursor).toBeNull();
  });
  it("starts over on an unknown cursor and clamps the limit", () => {
    expect(paginate(items, { cursor: "nope", limit: 2 }).items[0]?.id).toBe("i0");
    expect(clampLimit("500")).toBe(100);
    expect(clampLimit("0")).toBe(50);
    expect(clampLimit("abc")).toBe(50);
    expect(clampLimit(7.9)).toBe(7);
    expect(paginate(items).nextCursor).toBeNull();
  });
});

describe("disallowedVerb", () => {
  it("refuses DELETE, PUT and PATCH under /api/v1 and /api/mcp only", () => {
    expect(disallowedVerb("DELETE", "/api/v1/invoices/1")).toBe(true);
    expect(disallowedVerb("put", "/api/v1")).toBe(true);
    expect(disallowedVerb("PATCH", "/api/mcp")).toBe(true);
    expect(disallowedVerb("POST", "/api/v1/invoices")).toBe(false);
    expect(disallowedVerb("DELETE", "/api/uploads")).toBe(false);
    expect(disallowedVerb("GET", "/api/v1/invoices")).toBe(false);
    expect(ALLOW_HEADER).toBe("GET, POST, OPTIONS");
  });
});
