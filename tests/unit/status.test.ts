import { describe, expect, it } from "vitest";
import { todayIn } from "@/lib/dates";
import { STATUS_LABELS, displayStatus, type DisplayStatus } from "@/lib/invoices";
import { D, ZERO } from "@/lib/money";

type Inv = Parameters<typeof displayStatus>[0];

function invoice(overrides: Partial<Inv> = {}): Inv {
  return {
    status: "ISSUED",
    sentAt: null,
    dueDate: "2026-04-30",
    total: D("1000"),
    amountPaid: ZERO,
    amountCredited: ZERO,
    balanceDue: D("1000"),
    ...overrides,
  };
}

const today = "2026-04-15";

describe("displayStatus", () => {
  it("DRAFT and VOID come straight from the stored status", () => {
    expect(displayStatus(invoice({ status: "DRAFT" }), today)).toBe("DRAFT");
    expect(displayStatus(invoice({ status: "VOID", balanceDue: ZERO }), today)).toBe("VOID");
    // a void invoice is never OVERDUE or PAID, whatever the figures say
    expect(displayStatus(invoice({ status: "VOID", dueDate: "2026-01-01" }), today)).toBe("VOID");
  });

  it("ISSUED with nothing paid and not yet due", () => {
    expect(displayStatus(invoice(), today)).toBe("ISSUED");
  });

  it("SENT once sentAt is set", () => {
    expect(displayStatus(invoice({ sentAt: new Date("2026-04-10T10:00:00Z") }), today)).toBe(
      "SENT",
    );
  });

  it("OVERDUE beats PARTIALLY_PAID: a partly paid invoice past its due date is overdue", () => {
    const inv = invoice({
      dueDate: "2026-04-14",
      amountPaid: D("400"),
      balanceDue: D("600"),
      sentAt: new Date("2026-04-02T00:00:00Z"),
    });
    expect(displayStatus(inv, today)).toBe("OVERDUE");
  });
  it("PARTIALLY_PAID when some payment is in and a balance remains, even when sent", () => {
    const inv = invoice({
      sentAt: new Date("2026-04-10T10:00:00Z"),
      amountPaid: D("400"),
      balanceDue: D("600"),
    });
    expect(displayStatus(inv, today)).toBe("PARTIALLY_PAID");
  });

  it("PAID when the balance reaches zero through payments or credits", () => {
    expect(displayStatus(invoice({ amountPaid: D("1000"), balanceDue: ZERO }), today)).toBe("PAID");
    expect(displayStatus(invoice({ amountCredited: D("1000"), balanceDue: ZERO }), today)).toBe(
      "PAID",
    );
    // overpaid (negative balance) is still PAID
    expect(displayStatus(invoice({ amountPaid: D("1200"), balanceDue: D("-200") }), today)).toBe(
      "PAID",
    );
    // a paid invoice past its due date is PAID, not OVERDUE
    expect(
      displayStatus(
        invoice({ dueDate: "2026-01-01", amountPaid: D("1000"), balanceDue: ZERO }),
        today,
      ),
    ).toBe("PAID");
  });

  it("a zero-total invoice with nothing paid or credited is not PAID", () => {
    const zero = invoice({ total: ZERO, balanceDue: ZERO });
    expect(displayStatus(zero, today)).toBe("ISSUED");
    expect(displayStatus({ ...zero, sentAt: new Date("2026-04-10T10:00:00Z") }, today)).toBe(
      "SENT",
    );
    expect(displayStatus({ ...zero, dueDate: "2026-01-01" }, today)).toBe("ISSUED");
  });

  it("OVERDUE when a balance remains past the due date, sent or not", () => {
    expect(displayStatus(invoice({ dueDate: "2026-04-14" }), today)).toBe("OVERDUE");
    expect(
      displayStatus(
        invoice({ dueDate: "2026-04-14", sentAt: new Date("2026-04-01T00:00:00Z") }),
        today,
      ),
    ).toBe("OVERDUE");
    // due today is not overdue yet
    expect(displayStatus(invoice({ dueDate: today }), today)).toBe("ISSUED");
  });

  it("a token payment does not hide that the rest is late", () => {
    const inv = invoice({ dueDate: "2026-01-01", amountPaid: D("1"), balanceDue: D("999") });
    expect(displayStatus(inv, today)).toBe("OVERDUE");
  });

  it("overdue depends on the caller's today, which differs by timezone", () => {
    // 20:00 UTC on 2026-04-30: already 1 May in Kolkata, still 30 April in Los Angeles.
    const now = new Date("2026-04-30T20:00:00Z");
    const inv = invoice({ dueDate: "2026-04-30" });
    expect(displayStatus(inv, todayIn("Asia/Kolkata", now))).toBe("OVERDUE");
    expect(displayStatus(inv, todayIn("America/Los_Angeles", now))).toBe("ISSUED");
  });

  it("the full matrix for an issued invoice", () => {
    const cases: [Partial<Inv>, DisplayStatus][] = [
      [{}, "ISSUED"],
      [{ sentAt: new Date("2026-04-01T00:00:00Z") }, "SENT"],
      [{ dueDate: "2026-04-01" }, "OVERDUE"],
      [{ amountPaid: D("500"), balanceDue: D("500") }, "PARTIALLY_PAID"],
      [{ amountPaid: D("500"), balanceDue: D("500"), dueDate: "2026-04-01" }, "OVERDUE"],
      [{ amountPaid: D("1000"), balanceDue: ZERO }, "PAID"],
      [{ amountCredited: D("500"), balanceDue: D("500"), dueDate: "2026-04-01" }, "OVERDUE"],
      [{ amountCredited: D("500"), balanceDue: D("500") }, "ISSUED"],
    ];
    for (const [overrides, expected] of cases) {
      expect(displayStatus(invoice(overrides), today), JSON.stringify(overrides)).toBe(expected);
    }
  });
});

describe("STATUS_LABELS", () => {
  it("has a human label for every status", () => {
    expect(STATUS_LABELS).toEqual({
      DRAFT: "Draft",
      ISSUED: "Issued",
      SENT: "Sent",
      PARTIALLY_PAID: "Partially paid",
      PAID: "Paid",
      OVERDUE: "Overdue",
      VOID: "Void",
    });
  });
});
