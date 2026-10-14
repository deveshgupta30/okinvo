import { EInvoiceError } from "./connector";

/**
 * The IRP's signed QR payload is a JWT whose claims hold the invoice summary (spec §9e). Only
 * the payload is decoded here, for display; the document prints the raw JWT in its QR because
 * the signature belongs to the IRP and the officer's app verifies it against the IRP's key.
 */
export interface SignedQrPayload {
  sellerGstin: string;
  buyerGstin: string;
  docNo: string;
  docTyp: string;
  docDt: string;
  totInvVal: number;
  itemCnt: number;
  mainHsnCode: string;
  irn: string;
  irnDt: string;
}

function base64urlJson(segment: string): Record<string, unknown> {
  const text = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object") throw new EInvoiceError("Signed QR: not an object");
  return value as Record<string, unknown>;
}

export function decodeSignedQr(jwt: string): SignedQrPayload {
  const parts = jwt.trim().split(".");
  if (parts.length !== 3) throw new EInvoiceError("Signed QR: not a JWT");
  let claims: Record<string, unknown>;
  try {
    claims = base64urlJson(parts[1]!);
  } catch (e) {
    if (e instanceof EInvoiceError) throw e;
    throw new EInvoiceError("Signed QR: payload is not JSON");
  }
  // NIC nests the invoice summary as a JSON string under `data`
  const data =
    typeof claims.data === "string" ? (JSON.parse(claims.data) as Record<string, unknown>) : claims;
  const str = (k: string) =>
    typeof data[k] === "string" ? (data[k] as string) : String(data[k] ?? "");
  const num = (k: string) => Number(data[k] ?? 0);
  const irn = str("Irn");
  if (!irn) throw new EInvoiceError("Signed QR: no IRN in the payload");
  return {
    sellerGstin: str("SellerGstin"),
    buyerGstin: str("BuyerGstin"),
    docNo: str("DocNo"),
    docTyp: str("DocTyp"),
    docDt: str("DocDt"),
    totInvVal: num("TotInvVal"),
    itemCnt: num("ItemCnt"),
    mainHsnCode: str("MainHsnCode"),
    irn,
    irnDt: str("IrnDt"),
  };
}
