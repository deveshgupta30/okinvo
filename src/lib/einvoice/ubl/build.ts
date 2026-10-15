import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import { D } from "@/lib/money";
import { lineViews, money, taxBreakdown } from "../breakdown";
import { paymentMeansCode, unitCode, vatExemptionReason } from "../codes";
import type { EInvoiceInput, EInvoiceParty } from "../input";

/**
 * UBL 2.1 Invoice / CreditNote as profiled by Peppol BIS Billing 3.0 (spec §9e): the
 * EN 16931 customisation, EndpointID with its EAS scheme, payment means, the VAT breakdown
 * and the legal monetary total that reconcile with the invoice. Download only: no access
 * point is involved.
 */
export const UBL_CUSTOMIZATION =
  "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0";
export const UBL_PROFILE = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const NS = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  creditNote: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
};

function party(parent: XMLBuilder, name: string, p: EInvoiceParty): void {
  const el = parent.ele(`cac:${name}`).ele("cac:Party");
  if (p.electronicAddress && p.electronicAddressScheme) {
    el.ele("cbc:EndpointID", { schemeID: p.electronicAddressScheme }).txt(p.electronicAddress);
  }
  el.ele("cac:PartyName")
    .ele("cbc:Name")
    .txt(p.tradeName ?? p.legalName);
  const addr = el.ele("cac:PostalAddress");
  const a = p.address;
  if (a) {
    addr.ele("cbc:StreetName").txt(a.line1);
    if (a.line2) addr.ele("cbc:AdditionalStreetName").txt(a.line2);
    addr.ele("cbc:CityName").txt(a.city);
    if (a.postalCode) addr.ele("cbc:PostalZone").txt(a.postalCode);
    if (a.state) addr.ele("cbc:CountrySubentity").txt(a.state);
  } else if (p.addressLines?.length) {
    addr.ele("cbc:StreetName").txt(p.addressLines[0]!);
    if (p.addressLines[1]) addr.ele("cbc:AdditionalStreetName").txt(p.addressLines[1]);
  }
  addr.ele("cac:Country").ele("cbc:IdentificationCode").txt(p.countryCode.toUpperCase());
  const vat = p.gstin ?? (p.taxIdType === "GSTIN" || p.taxIdType === "VAT" ? p.taxId : undefined);
  if (vat) {
    const scheme = el.ele("cac:PartyTaxScheme");
    scheme.ele("cbc:CompanyID").txt(vat);
    scheme.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT");
  }
  el.ele("cac:PartyLegalEntity").ele("cbc:RegistrationName").txt(p.legalName);
  if (p.email || p.phone) {
    const contact = el.ele("cac:Contact");
    if (p.phone) contact.ele("cbc:Telephone").txt(p.phone);
    if (p.email) contact.ele("cbc:ElectronicMail").txt(p.email);
  }
}

export function toUbl(input: EInvoiceInput): string {
  const credit = input.kind === "CREDIT_NOTE";
  const views = lineViews(input);
  const breakdown = taxBreakdown(input, views);
  const cur = input.currency.toUpperCase();
  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele(credit ? "CreditNote" : "Invoice", {
    xmlns: credit ? NS.creditNote : NS.invoice,
    "xmlns:cac": NS.cac,
    "xmlns:cbc": NS.cbc,
  });
  root.ele("cbc:CustomizationID").txt(UBL_CUSTOMIZATION);
  root.ele("cbc:ProfileID").txt(UBL_PROFILE);
  root.ele("cbc:ID").txt(input.number);
  root.ele("cbc:IssueDate").txt(input.issueDate);
  if (input.dueDate && !credit) root.ele("cbc:DueDate").txt(input.dueDate);
  root.ele(credit ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode").txt(credit ? "381" : "380");
  if (input.notes) root.ele("cbc:Note").txt(input.notes);
  root.ele("cbc:DocumentCurrencyCode").txt(cur);
  if (input.buyerReference) root.ele("cbc:BuyerReference").txt(input.buyerReference);
  if (input.poReference) root.ele("cac:OrderReference").ele("cbc:ID").txt(input.poReference);
  if (credit && input.creditedInvoice) {
    const ref = root.ele("cac:BillingReference").ele("cac:InvoiceDocumentReference");
    ref.ele("cbc:ID").txt(input.creditedInvoice.number);
    ref.ele("cbc:IssueDate").txt(input.creditedInvoice.issueDate);
  }
  party(root, "AccountingSupplierParty", input.issuer);
  party(root, "AccountingCustomerParty", input.client);

  const bank = input.paymentMethods.find((m) => m.type === "BANK_TRANSFER");
  if (bank && !credit) {
    const line = (label: string) => bank.lines.find((l) => l.label === label)?.value;
    const iban = line("IBAN");
    const account = line("Account number");
    const bic = line("SWIFT/BIC");
    const means = root.ele("cac:PaymentMeans");
    means.ele("cbc:PaymentMeansCode", { name: bank.name }).txt(paymentMeansCode(Boolean(iban)));
    means.ele("cbc:PaymentID").txt(input.number);
    const acct = means.ele("cac:PayeeFinancialAccount");
    const id = iban ?? account;
    if (id) acct.ele("cbc:ID").txt(id);
    const holder = line("Account holder");
    if (holder) acct.ele("cbc:Name").txt(holder);
    if (bic) acct.ele("cac:FinancialInstitutionBranch").ele("cbc:ID").txt(bic);
  }
  const upi = input.paymentMethods.find((m) => m.type === "UPI");
  if (upi && !credit) {
    const vpa = upi.lines.find((l) => l.label === "UPI ID")?.value;
    const means = root.ele("cac:PaymentMeans");
    means.ele("cbc:PaymentMeansCode", { name: upi.name }).txt("ZZZ");
    means.ele("cbc:PaymentID").txt(vpa ? `UPI ${vpa}` : "UPI");
  }
  if (input.terms && !credit) root.ele("cac:PaymentTerms").ele("cbc:Note").txt(input.terms);

  const discount = D(input.totals.discountAmount);
  if (discount.gt(0)) {
    const ac = root.ele("cac:AllowanceCharge");
    ac.ele("cbc:ChargeIndicator").txt("false");
    ac.ele("cbc:AllowanceChargeReason").txt("Discount");
    ac.ele("cbc:Amount", { currencyID: cur }).txt(money(discount));
    const first = breakdown[0];
    const cat = ac.ele("cac:TaxCategory");
    cat.ele("cbc:ID").txt(first?.category ?? "S");
    cat.ele("cbc:Percent").txt(D(first?.rate ?? "0").toFixed(2));
    cat.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT");
  }

  const taxTotal = root.ele("cac:TaxTotal");
  taxTotal.ele("cbc:TaxAmount", { currencyID: cur }).txt(money(input.totals.taxAmount));
  for (const row of breakdown) {
    const sub = taxTotal.ele("cac:TaxSubtotal");
    sub.ele("cbc:TaxableAmount", { currencyID: cur }).txt(money(row.basis));
    sub.ele("cbc:TaxAmount", { currencyID: cur }).txt(money(row.tax));
    const cat = sub.ele("cac:TaxCategory");
    cat.ele("cbc:ID").txt(row.category);
    cat.ele("cbc:Percent").txt(D(row.rate).toFixed(2));
    const reason = vatExemptionReason(row.category);
    if (reason) {
      cat.ele("cbc:TaxExemptionReasonCode").txt(reason.code);
      cat.ele("cbc:TaxExemptionReason").txt(reason.text);
    }
    cat.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT");
  }

  const totals = root.ele("cac:LegalMonetaryTotal");
  totals.ele("cbc:LineExtensionAmount", { currencyID: cur }).txt(money(input.totals.subtotal));
  totals.ele("cbc:TaxExclusiveAmount", { currencyID: cur }).txt(money(input.totals.taxableAmount));
  totals
    .ele("cbc:TaxInclusiveAmount", { currencyID: cur })
    .txt(money(D(input.totals.taxableAmount).plus(input.totals.taxAmount)));
  if (discount.gt(0))
    totals.ele("cbc:AllowanceTotalAmount", { currencyID: cur }).txt(money(discount));
  const rounding = D(input.totals.roundingAdjustment);
  if (!rounding.isZero())
    totals.ele("cbc:PayableRoundingAmount", { currencyID: cur }).txt(money(rounding));
  totals.ele("cbc:PayableAmount", { currencyID: cur }).txt(money(input.totals.total));

  for (const v of views) {
    const li = root.ele(credit ? "cac:CreditNoteLine" : "cac:InvoiceLine");
    li.ele("cbc:ID").txt(String(v.line.position));
    li.ele(credit ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity", {
      unitCode: unitCode(v.line.unitType),
    }).txt(D(v.line.quantity).toFixed(3));
    li.ele("cbc:LineExtensionAmount", { currencyID: cur }).txt(money(v.gross));
    const item = li.ele("cac:Item");
    item.ele("cbc:Name").txt(v.line.description);
    if (v.line.sku) item.ele("cac:SellersItemIdentification").ele("cbc:ID").txt(v.line.sku);
    const cat = item.ele("cac:ClassifiedTaxCategory");
    cat.ele("cbc:ID").txt(v.category);
    cat.ele("cbc:Percent").txt(D(v.line.taxRate).toFixed(2));
    cat.ele("cac:TaxScheme").ele("cbc:ID").txt("VAT");
    li.ele("cac:Price").ele("cbc:PriceAmount", { currencyID: cur }).txt(money(v.line.unitPrice));
  }
  return doc.end({ prettyPrint: true });
}
