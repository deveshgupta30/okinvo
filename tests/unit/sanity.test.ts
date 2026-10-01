import { describe, expect, it } from "vitest";

describe("toolchain", () => {
  // A cold import of the dashboard page pulls in Prisma, the DAL and the UI kit; under a parallel
  // run that can take longer than Vitest's 5 s default, so this toolchain check gets its own budget.
  it("runs ESM TypeScript tests with the @/ alias available", async () => {
    const mod = await import("@/app/(app)/page");
    expect(typeof mod.default).toBe("function");
  }, 30_000);
});
