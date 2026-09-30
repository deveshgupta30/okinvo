import { describe, expect, it, vi } from "vitest";
import { lazyProxy } from "@/lib/lazy";

class Service {
  calls = 0;
  ping(): string {
    this.calls += 1;
    return "pong";
  }
}

describe("lazyProxy", () => {
  it("does not create the target until a member is first used, then exactly once", () => {
    const create = vi.fn(() => new Service());
    const proxy = lazyProxy(create);
    expect(create).not.toHaveBeenCalled();
    expect(proxy.ping()).toBe("pong");
    expect(proxy.ping()).toBe("pong");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("binds methods to the real target and keeps their identity stable", () => {
    const proxy = lazyProxy(() => new Service());
    const first = proxy.ping;
    expect(first()).toBe("pong"); // `this` is the target, not the proxy
    expect(proxy.ping).toBe(first);
    expect(proxy.calls).toBe(1);
  });
  it("supports `in`, Object.keys and instanceof", () => {
    const proxy = lazyProxy(() => new Service());
    expect("ping" in proxy).toBe(true);
    expect(Object.keys(proxy)).toEqual(["calls"]);
    expect(proxy instanceof Service).toBe(true);
  });
  it("propagates a throwing factory to the caller and retries on the next access", () => {
    let attempts = 0;
    const proxy = lazyProxy(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("not yet");
      return new Service();
    });
    expect(() => proxy.ping()).toThrow("not yet");
    expect(proxy.ping()).toBe("pong");
  });
});
