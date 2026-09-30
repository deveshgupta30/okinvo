import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  it("runs ESM TypeScript tests with the @/ alias available", async () => {
    const mod = await import("@/app/(app)/page");
    expect(typeof mod.default).toBe("function");
  });
});
