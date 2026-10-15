import { describe, expect, it } from "vitest";
import { createOutboundFetch, OutboundBlockedError, parseAllowList } from "@/lib/net/outbound";

/**
 * The one gated door to the internet (addendum §1): nothing leaves the server unless the host
 * is on OUTBOUND_ALLOW, every call carries a timeout, and the allow-list parses leniently.
 */
describe("parseAllowList", () => {
  it("splits a comma list, trims, lowercases and drops empties", () => {
    expect(parseAllowList(" api.frankfurter.app, Example.COM ,,")).toEqual([
      "api.frankfurter.app",
      "example.com",
    ]);
    expect(parseAllowList("")).toEqual([]);
    expect(parseAllowList(undefined)).toEqual([]);
  });
});

describe("createOutboundFetch", () => {
  it("refuses every host when the allow-list is empty", async () => {
    const calls: string[] = [];
    const out = createOutboundFetch({
      allow: [],
      fetch: async (input) => {
        calls.push(String(input));
        return new Response("ok");
      },
    });
    await expect(out("https://api.frankfurter.app/latest")).rejects.toBeInstanceOf(
      OutboundBlockedError,
    );
    expect(calls).toEqual([]);
  });

  it("passes an allowed host to the injected fetch with an abort signal", async () => {
    let seen: { url: string; signal: AbortSignal | null | undefined } | null = null;
    const out = createOutboundFetch({
      allow: ["api.frankfurter.app"],
      fetch: async (input, init) => {
        seen = { url: String(input), signal: init?.signal };
        return new Response("rates");
      },
    });
    const res = await out("https://api.frankfurter.app/latest?from=INR");
    expect(await res.text()).toBe("rates");
    expect(seen!.url).toBe("https://api.frankfurter.app/latest?from=INR");
    expect(seen!.signal).toBeInstanceOf(AbortSignal);
  });

  it("matches hosts exactly, not by suffix, and ignores the port and case", async () => {
    const out = createOutboundFetch({
      allow: ["example.com"],
      fetch: async () => new Response("ok"),
    });
    await expect(out("https://evil-example.com/x")).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(out("https://sub.example.com/x")).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(out("https://EXAMPLE.com:8443/x")).resolves.toBeInstanceOf(Response);
  });

  it("rejects plain http and malformed URLs before calling fetch", async () => {
    const out = createOutboundFetch({
      allow: ["example.com"],
      fetch: async () => new Response("ok"),
    });
    await expect(out("http://example.com/x")).rejects.toBeInstanceOf(OutboundBlockedError);
    await expect(out("not a url")).rejects.toBeInstanceOf(OutboundBlockedError);
  });

  it("aborts a call that outlives the timeout", async () => {
    const out = createOutboundFetch({
      allow: ["slow.example"],
      timeoutMs: 20,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    });
    await expect(out("https://slow.example/never")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });
});
