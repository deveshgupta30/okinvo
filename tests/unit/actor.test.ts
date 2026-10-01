import { describe, expect, it } from "vitest";
import { actorFromSession } from "@/server/actor";

const session = {
  user: { id: "u1", email: "Me@Example.com", name: "Me", role: null, timezone: null },
};

describe("actorFromSession", () => {
  it("defaults role to OWNER, timezone to UTC and lower-cases the email", () => {
    const a = actorFromSession(session, new Headers(), false);
    expect(a).toMatchObject({
      userId: "u1",
      email: "me@example.com",
      role: "OWNER",
      timezone: "UTC",
    });
    expect(a.ip).toBeUndefined();
  });
  it("keeps VIEWER and a stored timezone", () => {
    const a = actorFromSession(
      { user: { ...session.user, role: "VIEWER", timezone: "Asia/Kolkata" } },
      new Headers(),
      false,
    );
    expect(a.role).toBe("VIEWER");
    expect(a.timezone).toBe("Asia/Kolkata");
  });
  it("records the client IP only behind a trusted proxy, and the user agent always", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "UA/1" });
    expect(actorFromSession(session, h, true)).toMatchObject({
      ip: "203.0.113.9",
      userAgent: "UA/1",
    });
    expect(actorFromSession(session, h, false).ip).toBeUndefined();
  });
});
