import { describe, expect, it, vi } from "vitest";
import { validateAtBoot } from "@/lib/boot";

describe("validateAtBoot", () => {
  it("returns normally when validation passes", () => {
    const exit = vi.fn();
    const log = vi.fn();
    validateAtBoot(() => ({}), exit as unknown as (code: number) => never, log);
    expect(exit).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the reason and exits 1 when validation throws, instead of leaving a server that 500s", () => {
    const exit = vi.fn();
    const log = vi.fn();
    validateAtBoot(
      () => {
        throw new Error("Invalid environment:\n  APP_URL: bad");
      },
      exit as unknown as (code: number) => never,
      log,
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Invalid environment"));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
