import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { CII_GUIDELINE, toCii } from "@/lib/einvoice/cii/build";
import { ukCreditNoteInput, ukInput, ukReverseChargeInput } from "./einvoice-eu-input";
import { standardInput } from "./gst-einvoice.test";

/**
 * EN 16931 CII (spec §9e): the standard UK invoice and a credit note match their golden
 * fixtures after a parser round-trip; the monetary summation equals the invoice's totals;
 * reverse charge is AE with its exemption reason; an export under LUT is G.
 */
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const parse = (xml: string) => parser.parse(xml);
const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests", "fixtures", "einvoice", name), "utf8");
const settlementOf = (xml: string) =>
  parse(xml)["rsm:CrossIndustryInvoice"]["rsm:SupplyChainTradeTransaction"][
    "ram:ApplicableHeaderTradeSettlement"
  ];

describe("toCii", () => {
  it("matches the golden fixture for the standard UK VAT invoice", () => {
    const xml = toCii(ukInput());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(parse(xml)).toEqual(parse(fixture("cii-uk-invoice.xml")));
  });

  it("matches the golden fixture for a credit note and references the invoice", () => {
    const xml = toCii(ukCreditNoteInput());
    expect(parse(xml)).toEqual(parse(fixture("cii-uk-credit-note.xml")));
    const doc = parse(xml)["rsm:CrossIndustryInvoice"];
    expect(doc["rsm:ExchangedDocument"]["ram:TypeCode"]).toBe("381");
    const ref = settlementOf(xml)["ram:InvoiceReferencedDocument"];
    expect(ref["ram:IssuerAssignedID"]).toBe("INV-2026-0042");
    expect(ref["ram:FormattedIssueDateTime"]["qdt:DateTimeString"]["#text"]).toBe("20260501");
    expect(settlementOf(xml)["ram:SpecifiedTradeSettlementPaymentMeans"]).toBeUndefined();
  });

  it("carries the EN 16931 context, type code 380, format-102 dates and the endpoint scheme", () => {
    const doc = parse(toCii(ukInput()))["rsm:CrossIndustryInvoice"];
    expect(
      doc["rsm:ExchangedDocumentContext"]["ram:GuidelineSpecifiedDocumentContextParameter"][
        "ram:ID"
      ],
    ).toBe(CII_GUIDELINE);
    const header = doc["rsm:ExchangedDocument"];
    expect(header["ram:ID"]).toBe("INV-2026-0042");
    expect(header["ram:TypeCode"]).toBe("380");
    expect(header["ram:IssueDateTime"]["udt:DateTimeString"]).toEqual({
      "#text": "20260501",
      "@_format": "102",
    });
    const seller =
      doc["rsm:SupplyChainTradeTransaction"]["ram:ApplicableHeaderTradeAgreement"][
        "ram:SellerTradeParty"
      ];
    expect(seller["ram:URIUniversalCommunication"]["ram:URIID"]).toEqual({
      "#text": "GB123456789",
      "@_schemeID": "0088",
    });
    expect(seller["ram:SpecifiedTaxRegistration"]["ram:ID"]).toEqual({
      "#text": "GB123456789",
      "@_schemeID": "VA",
    });
  });

  it("reconciles the monetary summation and the tax breakdown with the invoice totals", () => {
    const settlement = settlementOf(toCii(ukInput()));
    const sum = settlement["ram:SpecifiedTradeSettlementHeaderMonetarySummation"];
    expect(sum["ram:LineTotalAmount"]).toBe("1075.00");
    expect(sum["ram:TaxBasisTotalAmount"]).toBe("1075.00");
    expect(sum["ram:TaxTotalAmount"]).toEqual({ "#text": "200.00", "@_currencyID": "GBP" });
    expect(sum["ram:GrandTotalAmount"]).toBe("1275.00");
    expect(sum["ram:DuePayableAmount"]).toBe("1275.00");
    const taxes = settlement["ram:ApplicableTradeTax"];
    expect(taxes).toHaveLength(2);
    expect(taxes[0]).toMatchObject({
      "ram:CategoryCode": "S",
      "ram:RateApplicablePercent": "20.00",
      "ram:BasisAmount": "1000.00",
      "ram:CalculatedAmount": "200.00",
    });
    expect(taxes[1]).toMatchObject({
      "ram:CategoryCode": "Z",
      "ram:RateApplicablePercent": "0.00",
      "ram:BasisAmount": "75.00",
      "ram:CalculatedAmount": "0.00",
    });
    const means = settlement["ram:SpecifiedTradeSettlementPaymentMeans"];
    expect(means["ram:TypeCode"]).toBe("58");
    expect(means["ram:PayeePartyCreditorFinancialAccount"]["ram:IBANID"]).toBe(
      "GB29NWBK60161331926819",
    );
    expect(means["ram:PayeeSpecifiedCreditorFinancialInstitution"]["ram:BICID"]).toBe("NWBKGB2L");
    expect(
      settlement["ram:SpecifiedTradePaymentTerms"]["ram:DueDateDateTime"]["udt:DateTimeString"][
        "#text"
      ],
    ).toBe("20260531");
  });

  it("spreads an invoice-level discount over the lines so the breakdown still reconciles", () => {
    const inv = ukInput({
      totals: {
        subtotal: "1075.00",
        discountAmount: "100.00",
        taxableAmount: "975.00",
        taxAmount: "186.05",
        roundingAdjustment: "0.00",
        total: "1161.05",
        tdsRate: "0",
        tdsExpected: "0.00",
      },
      taxLines: [{ taxType: "VAT", rate: "20", taxableAmount: "930.23", taxAmount: "186.05" }],
    });
    const settlement = settlementOf(toCii(inv));
    const taxes = settlement["ram:ApplicableTradeTax"] as { "ram:BasisAmount": string }[];
    const basis = taxes.reduce((n, t) => n + Number(t["ram:BasisAmount"]), 0);
    expect(basis).toBeCloseTo(975, 2);
    expect(taxes[0]).toMatchObject({ "ram:CalculatedAmount": "186.05" });
    expect(settlement["ram:SpecifiedTradeAllowanceCharge"]["ram:ActualAmount"]).toBe("100.00");
    const sum = settlement["ram:SpecifiedTradeSettlementHeaderMonetarySummation"];
    expect(sum["ram:AllowanceTotalAmount"]).toBe("100.00");
    expect(sum["ram:TaxBasisTotalAmount"]).toBe("975.00");
  });

  it("marks reverse charge as AE with its exemption reason", () => {
    const tax = settlementOf(toCii(ukReverseChargeInput()))["ram:ApplicableTradeTax"];
    expect(tax["ram:CategoryCode"]).toBe("AE");
    expect(tax["ram:ExemptionReasonCode"]).toBe("VATEX-EU-AE");
    expect(tax["ram:ExemptionReason"]).toBe("Reverse charge");
    expect(tax["ram:CalculatedAmount"]).toBe("0.00");
  });

  it("marks a zero-rated export under LUT as G", () => {
    const inv = standardInput({
      supplyType: "EXPORT_LUT",
      currency: "USD",
      lines: [
        { ...standardInput().lines[0]!, taxRate: "0", taxAmount: "0.00", lineTotal: "10000.00" },
      ],
      taxLines: [],
      totals: {
        subtotal: "10000.00",
        discountAmount: "0.00",
        taxableAmount: "10000.00",
        taxAmount: "0.00",
        roundingAdjustment: "0.00",
        total: "10000.00",
        tdsRate: "0",
        tdsExpected: "0.00",
      },
    });
    const tx = parse(toCii(inv))["rsm:CrossIndustryInvoice"]["rsm:SupplyChainTradeTransaction"];
    expect(
      tx["ram:ApplicableHeaderTradeSettlement"]["ram:ApplicableTradeTax"]["ram:CategoryCode"],
    ).toBe("G");
    const line = tx["ram:IncludedSupplyChainTradeLineItem"];
    expect(
      line["ram:SpecifiedLineTradeSettlement"]["ram:ApplicableTradeTax"]["ram:CategoryCode"],
    ).toBe("G");
    expect(line["ram:SpecifiedLineTradeDelivery"]["ram:BilledQuantity"]["@_unitCode"]).toBe("HUR");
  });
});
