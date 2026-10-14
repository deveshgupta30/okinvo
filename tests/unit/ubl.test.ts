import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { UBL_CUSTOMIZATION, UBL_PROFILE, toUbl } from "@/lib/einvoice/ubl/build";
import { ukCreditNoteInput, ukInput, ukReverseChargeInput } from "./einvoice-eu-input";

/**
 * Peppol BIS Billing 3.0 UBL (spec §9e): golden fixtures for the standard UK invoice and a
 * credit note; EndpointID with its EAS scheme; the tax total and legal monetary total
 * reconcile with the invoice; reverse charge is AE with its exemption reason.
 */
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
const parse = (xml: string) => parser.parse(xml);
const fixture = (name: string) =>
  readFileSync(join(process.cwd(), "tests", "fixtures", "einvoice", name), "utf8");

describe("toUbl", () => {
  it("matches the golden fixture for the standard UK VAT invoice", () => {
    expect(parse(toUbl(ukInput()))).toEqual(parse(fixture("ubl-uk-invoice.xml")));
  });

  it("matches the golden fixture for a credit note with a billing reference", () => {
    const xml = toUbl(ukCreditNoteInput());
    expect(parse(xml)).toEqual(parse(fixture("ubl-uk-credit-note.xml")));
    const cn = parse(xml).CreditNote;
    expect(cn["@_xmlns"]).toBe("urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2");
    expect(cn["cbc:CreditNoteTypeCode"]).toBe("381");
    expect(cn["cac:BillingReference"]["cac:InvoiceDocumentReference"]).toEqual({
      "cbc:ID": "INV-2026-0042",
      "cbc:IssueDate": "2026-05-01",
    });
    expect(cn["cac:CreditNoteLine"]["cbc:CreditedQuantity"]).toEqual({
      "#text": "10.000",
      "@_unitCode": "HUR",
    });
    expect(cn["cbc:DueDate"]).toBeUndefined();
    expect(cn["cac:PaymentMeans"]).toBeUndefined();
  });

  it("carries the Peppol identifiers, endpoint schemes and payment means", () => {
    const inv = parse(toUbl(ukInput())).Invoice;
    expect(inv["cbc:CustomizationID"]).toBe(UBL_CUSTOMIZATION);
    expect(inv["cbc:ProfileID"]).toBe(UBL_PROFILE);
    expect(inv["cbc:InvoiceTypeCode"]).toBe("380");
    expect(inv["cbc:IssueDate"]).toBe("2026-05-01");
    expect(inv["cbc:DueDate"]).toBe("2026-05-31");
    expect(inv["cbc:DocumentCurrencyCode"]).toBe("GBP");
    expect(inv["cbc:BuyerReference"]).toBe("COST-CENTRE-12");
    const seller = inv["cac:AccountingSupplierParty"]["cac:Party"];
    expect(seller["cbc:EndpointID"]).toEqual({ "#text": "GB123456789", "@_schemeID": "0088" });
    expect(seller["cac:PartyTaxScheme"]["cbc:CompanyID"]).toBe("GB123456789");
    expect(seller["cac:PartyLegalEntity"]["cbc:RegistrationName"]).toBe("Jo Bloggs Ltd");
    const buyer = inv["cac:AccountingCustomerParty"]["cac:Party"];
    expect(buyer["cbc:EndpointID"]["@_schemeID"]).toBe("9932");
    const means = inv["cac:PaymentMeans"];
    expect(means["cbc:PaymentMeansCode"]["#text"]).toBe("58");
    expect(means["cac:PayeeFinancialAccount"]["cbc:ID"]).toBe("GB29NWBK60161331926819");
    expect(means["cac:PayeeFinancialAccount"]["cac:FinancialInstitutionBranch"]["cbc:ID"]).toBe(
      "NWBKGB2L",
    );
  });

  it("reconciles the tax total, subtotals and legal monetary total with the invoice", () => {
    const inv = parse(toUbl(ukInput())).Invoice;
    const tax = inv["cac:TaxTotal"];
    expect(tax["cbc:TaxAmount"]).toEqual({ "#text": "200.00", "@_currencyID": "GBP" });
    const subs = tax["cac:TaxSubtotal"];
    expect(subs).toHaveLength(2);
    expect(subs[0]["cbc:TaxableAmount"]["#text"]).toBe("1000.00");
    expect(subs[0]["cac:TaxCategory"]).toMatchObject({ "cbc:ID": "S", "cbc:Percent": "20.00" });
    expect(subs[1]["cbc:TaxableAmount"]["#text"]).toBe("75.00");
    expect(subs[1]["cac:TaxCategory"]).toMatchObject({ "cbc:ID": "Z", "cbc:Percent": "0.00" });
    const total = inv["cac:LegalMonetaryTotal"];
    expect(total["cbc:LineExtensionAmount"]["#text"]).toBe("1075.00");
    expect(total["cbc:TaxExclusiveAmount"]["#text"]).toBe("1075.00");
    expect(total["cbc:TaxInclusiveAmount"]["#text"]).toBe("1275.00");
    expect(total["cbc:PayableAmount"]["#text"]).toBe("1275.00");
    const lines = inv["cac:InvoiceLine"];
    expect(lines[0]["cbc:InvoicedQuantity"]).toEqual({ "#text": "10.000", "@_unitCode": "HUR" });
    expect(lines[1]["cbc:InvoicedQuantity"]["@_unitCode"]).toBe("C62");
    expect(lines[1]["cac:Item"]["cac:SellersItemIdentification"]["cbc:ID"]).toBe("MAN-01");
    expect(lines[0]["cac:Price"]["cbc:PriceAmount"]["#text"]).toBe("100.00");
  });

  it("marks reverse charge as AE with its exemption reason", () => {
    const inv = parse(toUbl(ukReverseChargeInput())).Invoice;
    const cat = inv["cac:TaxTotal"]["cac:TaxSubtotal"]["cac:TaxCategory"];
    expect(cat["cbc:ID"]).toBe("AE");
    expect(cat["cbc:TaxExemptionReasonCode"]).toBe("VATEX-EU-AE");
    expect(cat["cbc:TaxExemptionReason"]).toBe("Reverse charge");
    expect(inv["cac:TaxTotal"]["cbc:TaxAmount"]["#text"]).toBe("0.00");
    expect(inv["cac:InvoiceLine"]["cac:Item"]["cac:ClassifiedTaxCategory"]["cbc:ID"]).toBe("AE");
  });
});
