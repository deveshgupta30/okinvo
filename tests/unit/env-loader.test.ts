import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createEnvLoader } from "@/lib/env-loader";

const schema = z.object({ APP_URL: z.url(), PORT: z.coerce.number().default(3000) });

describe("createEnvLoader", () => {
  it("reads and validates once, then returns the same object", () => {
    const read = vi.fn(() => ({ APP_URL: "https://a.example" }));
    const load = createEnvLoader(schema, read);
    const first = load();
    const second = load();
    expect(first).toBe(second);
    expect(first.PORT).toBe(3000);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("throws a readable 'Invalid environment' message listing each bad key", () => {
    const load = createEnvLoader(schema, () => ({ APP_URL: "nope", PORT: "x" }));
    expect(load).toThrow(/^Invalid environment:\n {2}APP_URL: /);
    expect(load).toThrow(/\n {2}PORT: /);
  });
  it("does not cache a failure, so a corrected environment loads on the next call", () => {
    let source: Record<string, string> = { APP_URL: "nope" };
    const load = createEnvLoader(schema, () => source);
    expect(load).toThrow(/Invalid environment/);
    source = { APP_URL: "https://a.example" };
    expect(load().APP_URL).toBe("https://a.example");
  });
});
