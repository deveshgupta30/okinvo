import { describe, expect, it } from "vitest";
import { paymentCheckpoints } from "@/lib/payments/progress";

const invoice = {
  status: "ISSUED" as const,
  sentAt: null as string | null,
  balanceDue: "1180.00",
};
const payment = (over: Partial<{ amountApplied: string; paymentDate: string; files: number }>) => ({
  id: "p",
  kind: "PAYMENT" as const,
  amountApplied: "500.00",
  paymentDate: "2026-05-10",
  attachmentCount: 0,
  ...(over.amountApplied ? { amountApplied: over.amountApplied } : {}),
  ...(over.paymentDate ? { paymentDate: over.paymentDate } : {}),
  ...(over.files !== undefined ? { attachmentCount: over.files } : {}),
});

/** Addendum §4: Issued → Sent → Payment recorded (one per payment) → Paid in full → Receipt attached. */
describe("paymentCheckpoints", () => {
  it("lists the five checkpoints for a draft, none done", () => {
    const steps = paymentCheckpoints({ ...invoice, status: "DRAFT" }, []);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["issued", false],
      ["sent", false],
      ["payment", false],
      ["paid", false],
      ["receipt", false],
    ]);
  });

  it("ticks issued and sent from the invoice, and one payment line per entry", () => {
    const steps = paymentCheckpoints({ ...invoice, sentAt: "2026-05-02T10:00:00.000Z" }, [
      payment({ amountApplied: "500.00", paymentDate: "2026-05-10" }),
      payment({ amountApplied: "180.00", paymentDate: "2026-05-12", files: 2 }),
    ]);
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["issued", true],
      ["sent", true],
      ["payment", true],
      ["payment", true],
      ["paid", false],
      ["receipt", true],
    ]);
    expect(steps[2]).toMatchObject({ amount: "500.00", date: "2026-05-10" });
    expect(steps[3]).toMatchObject({ amount: "180.00", date: "2026-05-12" });
  });

  it("marks paid in full only when an issued invoice has no balance left", () => {
    const paid = paymentCheckpoints({ ...invoice, balanceDue: "0.00" }, [
      payment({ amountApplied: "1180.00" }),
    ]);
    expect(paid.find((s) => s.key === "paid")?.done).toBe(true);
    // a draft with a zero total is not "paid"
    const draft = paymentCheckpoints({ ...invoice, status: "DRAFT", balanceDue: "0.00" }, []);
    expect(draft.find((s) => s.key === "paid")?.done).toBe(false);
  });

  it("ignores refunds and write-offs for the payment lines but counts their receipts", () => {
    const steps = paymentCheckpoints(invoice, [
      { ...payment({ amountApplied: "-100.00" }), kind: "REFUND", attachmentCount: 1 },
    ]);
    expect(steps.filter((s) => s.key === "payment")).toEqual([
      expect.objectContaining({ done: false }),
    ]);
    expect(steps.find((s) => s.key === "receipt")?.done).toBe(true);
  });
});
