import { describe, expect, it } from "vitest";
import { decodeSignedQr } from "@/lib/einvoice/gst/signed-qr";
import { parseIrpResponse, parseIstDate } from "@/lib/einvoice/gst/manual";

const b64url = (v: unknown) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** A JWT the way the IRP issues it: the invoice summary is a JSON string under `data`. */
export const FIXTURE_IRN = "a".repeat(40) + "0123456789abcdef01234567";
export function fixtureSignedQr(): string {
  const data = {
    SellerGstin: "29ABCDE1234F1Z5",
    BuyerGstin: "29AAAAA0000A1Z5",
    DocNo: "INV/26-27/007",
    DocTyp: "INV",
    DocDt: "15/04/2026",
    TotInvVal: 12390,
    ItemCnt: 2,
    MainHsnCode: "998314",
    Irn: FIXTURE_IRN,
    IrnDt: "2026-04-15 10:30:00",
  };
  return [
    b64url({ alg: "RS256", typ: "JWT" }),
    b64url({ data: JSON.stringify(data), iss: "NIC" }),
    b64url("sig"),
  ].join(".");
}

/** The portal's generate reply as the owner pastes it (spec §9e). */
export function fixtureIrpResponse() {
  return {
    AckNo: 112010000000001,
    AckDt: "2026-04-15 10:30:00",
    Irn: FIXTURE_IRN,
    SignedInvoice: "eyJhbGciOiJSUzI1NiJ9.e30.sig",
    SignedQRCode: fixtureSignedQr(),
    Status: "ACT",
  };
}

describe("decodeSignedQr", () => {
  it("decodes the invoice summary from the IRP's JWT", () => {
    const p = decodeSignedQr(fixtureSignedQr());
    expect(p).toEqual({
      sellerGstin: "29ABCDE1234F1Z5",
      buyerGstin: "29AAAAA0000A1Z5",
      docNo: "INV/26-27/007",
      docTyp: "INV",
      docDt: "15/04/2026",
      totInvVal: 12390,
      itemCnt: 2,
      mainHsnCode: "998314",
      irn: FIXTURE_IRN,
      irnDt: "2026-04-15 10:30:00",
    });
  });
  it("rejects what is not a JWT with an IRN", () => {
    expect(() => decodeSignedQr("not-a-jwt")).toThrow(/JWT/);
    expect(() => decodeSignedQr(`${b64url({})}.${b64url({ foo: 1 })}.x`)).toThrow(/IRN/);
  });
});

describe("parseIrpResponse", () => {
  it("accepts the NIC reply, a Data envelope and a JSON string", () => {
    const r = parseIrpResponse(fixtureIrpResponse());
    expect(r.irn).toBe(FIXTURE_IRN);
    expect(r.ackNo).toBe("112010000000001");
    expect(r.ackDate).toBe("2026-04-15T05:00:00.000Z");
    expect(r.signedQr).toBe(fixtureSignedQr());
    expect(parseIrpResponse({ Data: fixtureIrpResponse() }).irn).toBe(FIXTURE_IRN);
    expect(parseIrpResponse(JSON.stringify(fixtureIrpResponse())).ackNo).toBe("112010000000001");
  });
  it("rejects a malformed IRN or date", () => {
    expect(() => parseIrpResponse({ ...fixtureIrpResponse(), Irn: "short" })).toThrow(/Irn/);
    expect(() => parseIrpResponse({ ...fixtureIrpResponse(), AckDt: "yesterday" })).toThrow(
      /AckDt/,
    );
    expect(() => parseIrpResponse("{nope")).toThrow(/JSON/);
  });
  it("reads IST unless the date carries its own zone", () => {
    expect(parseIstDate("2026-04-15 10:30:00")).toBe("2026-04-15T05:00:00.000Z");
    expect(parseIstDate("2026-04-15T10:30:00Z")).toBe("2026-04-15T10:30:00.000Z");
  });
});
