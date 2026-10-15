import { describe, expect, it } from "vitest";
import { actorFromSession } from "@/server/actor";

const session = {
  user: { id: "u1", email: "Me@Example.com", name: "Me", role: null, timezone: null },
};

describe("actorFromSession", () => {
  it("defaults role to OWNER, timezone to UTC, locale to en-US and lower-cases the email", () => {
    const a = actorFromSession(session, new Headers(), false);
    expect(a).toMatchObject({
      userId: "u1",
      email: "me@example.com",
      role: "OWNER",
      timezone: "UTC",
      locale: "en-US",
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
  it("keeps a stored UI language and canonicalises its spelling", () => {
    const a = actorFromSession({ user: { ...session.user, locale: "de" } }, new Headers(), false);
    expect(a.locale).toBe("de");
    expect(
      actorFromSession({ user: { ...session.user, locale: "en-gb" } }, new Headers(), false).locale,
    ).toBe("en-GB");
    expect(
      actorFromSession({ user: { ...session.user, locale: "xx" } }, new Headers(), false).locale,
    ).toBe("en-US");
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
