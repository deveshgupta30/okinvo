import { D, apportion, roundMoney, sum, type Decimal } from "@/lib/money";
import type { UnitType } from "@/lib/schemas/service-input";
import type { EInvoiceInput, EInvoiceLine } from "../input";
import { GstEInvoiceSchema, type GstEInvoice } from "./schema";

/**
 * Builds the GST e-invoice JSON (INV-01 v1.1, spec §9e) from an issued invoice's snapshots.
 * All arithmetic is Decimal; the JSON carries numbers only at this boundary because the IRP
 * schema wants them. Every rule the IRP would reject on is checked here first, so the error
 * names the field instead of a remote 4xx.
 */
export class GstEInvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GstEInvoiceError";
  }
}

/** Unit Quantity Codes (UQC) the IRP accepts; services use OTH. */
const UQC: Record<UnitType, string> = {
  HOUR: "OTH",
  DAY: "DAY",
  UNIT: "NOS",
  FIXED: "OTH",
  MILESTONE: "OTH",
};

const num = (v: Decimal.Value) => Number(D(v).toFixed(2));
const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

function dateDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function supplyType(input: EInvoiceInput): GstEInvoice["TranDtls"]["SupTyp"] {
  switch (input.supplyType) {
    case "INTRA_STATE":
    case "INTER_STATE":
    case "REVERSE_CHARGE":
      return "B2B";
    case "EXPORT_LUT":
      return "EXPWOP";
    case "EXPORT_WITH_TAX":
      return "EXPWP";
    default:
      throw new GstEInvoiceError("A GST e-invoice needs a GST supply type (B2B or export).");
  }
}

function party(
  p: EInvoiceInput["issuer"],
  role: "Seller" | "Buyer",
): Omit<GstEInvoice["SellerDtls"], "Gstin"> {
  const a = p.address;
  if (!a) {
    throw new GstEInvoiceError(
      `${role}Dtls: the document was issued without a structured address; reissue it to register an e-invoice.`,
    );
  }
  const pin = digits(a.postalCode);
  if (!/^\d{6}$/.test(pin)) throw new GstEInvoiceError(`${role}Dtls.Pin must be 6 digits`);
  const stcd = p.gstStateCode;
  if (!stcd) throw new GstEInvoiceError(`${role}Dtls.Stcd: the GST state code is missing`);
  const phone = digits(p.phone);
  return {
    LglNm: p.legalName,
    ...(p.tradeName ? { TrdNm: p.tradeName } : {}),
    Addr1: a.line1,
    ...(a.line2 ? { Addr2: a.line2 } : {}),
    Loc: a.city,
    Pin: Number(pin),
    Stcd: stcd,
    ...(phone.length >= 6 ? { Ph: phone.slice(-12) } : {}),
    ...(p.email ? { Em: p.email } : {}),
  };
}

/** Foreign buyers (exports): GSTIN URP, state 96, PIN 999999 as the IRP prescribes. */
function foreignBuyer(p: EInvoiceInput["client"]): GstEInvoice["BuyerDtls"] {
  const a = p.address;
  return {
    Gstin: "URP",
    LglNm: p.legalName,
    Addr1: a?.line1 ?? p.addressLines?.[0] ?? p.legalName,
    Loc: a?.city ?? p.addressLines?.[1] ?? p.countryCode,
    Pin: 999999,
    Stcd: "96",
    Pos: "96",
    ...(p.email ? { Em: p.email } : {}),
  };
}

function items(input: EInvoiceInput, interState: boolean): GstEInvoice["ItemList"] {
  const subtotal = D(input.totals.subtotal);
  const discount = D(input.totals.discountAmount);
  // the invoice-level discount is spread over the lines by their share of the subtotal, so the
  // items' assessable values add up to the invoice's
  const shares =
    discount.isZero() || subtotal.isZero()
      ? input.lines.map(() => D(0))
      : apportion(
          discount,
          input.lines.map((l) => D(l.lineSubtotal).div(subtotal)),
          input.currency,
        );
  return input.lines.map((line: EInvoiceLine, i) => {
    const hsn = digits(line.sacHsnCode);
    if (!/^\d{4,8}$/.test(hsn)) {
      throw new GstEInvoiceError(
        `ItemList[${i}].HsnCd must be 4 to 8 digits (line ${line.position})`,
      );
    }
    const lineDiscount = shares[i] ?? D(0);
    const totAmt = roundMoney(D(line.quantity).mul(line.unitPrice), input.currency);
    const assAmt = roundMoney(D(line.lineSubtotal).minus(lineDiscount), input.currency);
    const rate = D(line.taxRate);
    const tax = roundMoney(assAmt.mul(rate).div(100), input.currency);
    const half = roundMoney(tax.div(2), input.currency);
    const igst = interState ? tax : D(0);
    const cgst = interState ? D(0) : half;
    const sgst = interState ? D(0) : tax.minus(half);
    return {
      SlNo: String(line.position),
      PrdDesc: line.description.slice(0, 300),
      IsServc: line.unitType === "UNIT" ? "N" : "Y",
      HsnCd: hsn,
      Qty: Number(D(line.quantity).toFixed(3)),
      Unit: UQC[line.unitType],
      UnitPrice: num(line.unitPrice),
      TotAmt: num(totAmt),
      Discount: num(lineDiscount),
      AssAmt: num(assAmt),
      GstRt: num(rate),
      IgstAmt: num(igst),
      CgstAmt: num(cgst),
      SgstAmt: num(sgst),
      CesRt: 0,
      TotItemVal: num(assAmt.plus(tax)),
    };
  });
}

function payDtls(input: EInvoiceInput): GstEInvoice["PayDtls"] | undefined {
  const bank = input.paymentMethods.find((m) => m.type === "BANK_TRANSFER");
  if (!bank) return undefined;
  const line = (label: string) => bank.lines.find((l) => l.label === label)?.value;
  const holder = line("Account holder");
  const account = line("Account number");
  const ifsc = line("IFSC");
  const out: NonNullable<GstEInvoice["PayDtls"]> = { Mode: "Bank transfer" };
  if (holder) out.Nm = holder.slice(0, 100);
  if (account && account.length <= 18) out.AccDet = account;
  if (ifsc && ifsc.length <= 11) out.FinInsBr = ifsc;
  if (input.client.paymentTermsDays !== undefined)
    out.PayTerm = String(input.client.paymentTermsDays);
  return out;
}

export function toGstEInvoice(input: EInvoiceInput): GstEInvoice {
  if (input.taxRegime !== "INDIA_GST") {
    throw new GstEInvoiceError("Only invoices under the India GST regime have a GST e-invoice.");
  }
  if (!input.issuer.gstin) {
    throw new GstEInvoiceError("SellerDtls.Gstin: the issuer has no GSTIN.");
  }
  const supTyp = supplyType(input);
  const isExport = supTyp === "EXPWOP" || supTyp === "EXPWP";
  const interState = isExport || input.taxLines.some((t) => t.taxType === "IGST");
  const seller: GstEInvoice["SellerDtls"] = {
    Gstin: input.issuer.gstin,
    ...party(input.issuer, "Seller"),
  };
  const buyer: GstEInvoice["BuyerDtls"] = isExport
    ? foreignBuyer(input.client)
    : {
        Gstin:
          input.client.taxIdType === "GSTIN" && input.client.taxId ? input.client.taxId : "URP",
        ...party(input.client, "Buyer"),
        Pos: input.client.gstStateCode ?? "",
      };
  const taxOf = (type: "CGST" | "SGST" | "IGST") =>
    sum(input.taxLines.filter((t) => t.taxType === type).map((t) => t.taxAmount));
  const cgst = taxOf("CGST");
  const sgst = taxOf("SGST");
  const igst = taxOf("IGST");
  const assVal = D(input.totals.taxableAmount);
  const rndOff = D(input.totals.roundingAdjustment);
  const total = D(input.totals.total);
  const expected = assVal.plus(cgst).plus(sgst).plus(igst).plus(rndOff);
  if (!expected.eq(total)) {
    throw new GstEInvoiceError(
      `ValDtls.TotInvVal ${total.toFixed(2)} does not reconcile with assessable value plus tax plus rounding ${expected.toFixed(2)}`,
    );
  }
  const json: GstEInvoice = {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: supTyp,
      RegRev: input.isReverseCharge ? "Y" : "N",
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: input.kind === "CREDIT_NOTE" ? "CRN" : "INV",
      No: input.number,
      Dt: dateDdMmYyyy(input.issueDate),
    },
    SellerDtls: seller,
    BuyerDtls: buyer,
    ItemList: items(input, interState),
    ValDtls: {
      AssVal: num(assVal),
      CgstVal: num(cgst),
      SgstVal: num(sgst),
      IgstVal: num(igst),
      CesVal: 0,
      StCesVal: 0,
      Discount: num(input.totals.discountAmount),
      OthChrg: 0,
      RndOffAmt: num(rndOff),
      TotInvVal: num(total),
    },
    ...(isExport
      ? {
          ExpDtls: {
            RefClm: supTyp === "EXPWP" ? "Y" : "N",
            ForCur: input.currency,
            CntCode: input.client.countryCode,
          },
        }
      : {}),
  };
  const pay = payDtls(input);
  if (pay) json.PayDtls = pay;
  const parsed = GstEInvoiceSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new GstEInvoiceError(`${issue?.path.join(".")}: ${issue?.message}`);
  }
  return parsed.data;
}
