import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkReadiness } from "@/lib/health";

describe("checkReadiness", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is 200 when the probe resolves", async () => {
    await expect(checkReadiness(async () => undefined, 1000)).resolves.toEqual({
      status: 200,
      body: { ok: true, db: "ok" },
    });
  });
  it("is 503 'error' when the probe rejects", async () => {
    await expect(
      checkReadiness(async () => {
        throw new Error("down");
      }, 1000),
    ).resolves.toEqual({ status: 503, body: { ok: false, db: "error" } });
  });
  it("is 503 'timeout' when the probe hangs, without waiting longer than the budget", async () => {
    const pending = checkReadiness(() => new Promise(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ status: 503, body: { ok: false, db: "timeout" } });
  });
  it("reports the failure cause to the caller so it can be logged", async () => {
    const onFailure = vi.fn();
    const error = new Error("down");
    await checkReadiness(
      async () => {
        throw error;
      },
      1000,
      onFailure,
    );
    expect(onFailure).toHaveBeenCalledWith("error", error);

    const pending = checkReadiness(() => new Promise(() => {}), 1000, onFailure);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(onFailure).toHaveBeenCalledWith("timeout", undefined);
  });
});
