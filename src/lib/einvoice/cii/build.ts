import { create } from "xmlbuilder2";
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import { D } from "@/lib/money";
import { lineViews, money, taxBreakdown } from "../breakdown";
import { paymentMeansCode, unitCode, vatExemptionReason } from "../codes";
import type { EInvoiceInput, EInvoiceParty } from "../input";

/**
 * UN/CEFACT Cross Industry Invoice D16B as profiled by EN 16931 (the Factur-X / ZUGFeRD 2.3
 * EN16931 profile, spec §9e). Element order follows the schema; dates are format 102
 * (YYYYMMDD); amounts are two-decimal strings in the document currency.
 */
const NS = {
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};

export const CII_GUIDELINE = "urn:cen.eu:en16931:2017";

const date102 = (iso: string) => iso.replace(/-/g, "");

function dateTime(parent: XMLBuilder, name: string, iso: string): void {
  parent.ele(`ram:${name}`).ele("udt:DateTimeString", { format: "102" }).txt(date102(iso));
}

function party(parent: XMLBuilder, name: string, p: EInvoiceParty): void {
  const el = parent.ele(`ram:${name}`);
  el.ele("ram:Name").txt(p.legalName);
  if (p.phone || p.email) {
    const contact = el.ele("ram:DefinedTradeContact");
    if (p.phone)
      contact.ele("ram:TelephoneUniversalCommunication").ele("ram:CompleteNumber").txt(p.phone);
    if (p.email) contact.ele("ram:EmailURIUniversalCommunication").ele("ram:URIID").txt(p.email);
  }
  const addr = el.ele("ram:PostalTradeAddress");
  const a = p.address;
  if (a?.postalCode) addr.ele("ram:PostcodeCode").txt(a.postalCode);
  if (a) {
    addr.ele("ram:LineOne").txt(a.line1);
    if (a.line2) addr.ele("ram:LineTwo").txt(a.line2);
    addr.ele("ram:CityName").txt(a.city);
  } else if (p.addressLines?.length) {
    addr.ele("ram:LineOne").txt(p.addressLines[0]!);
    if (p.addressLines[1]) addr.ele("ram:LineTwo").txt(p.addressLines[1]);
  }
  addr.ele("ram:CountryID").txt(p.countryCode.toUpperCase());
  if (a?.state) addr.ele("ram:CountrySubDivisionName").txt(a.state);
  if (p.electronicAddress && p.electronicAddressScheme) {
    el.ele("ram:URIUniversalCommunication")
      .ele("ram:URIID", { schemeID: p.electronicAddressScheme })
      .txt(p.electronicAddress);
  }
  const vat = p.gstin ?? (p.taxIdType === "GSTIN" || p.taxIdType === "VAT" ? p.taxId : undefined);
  if (vat) el.ele("ram:SpecifiedTaxRegistration").ele("ram:ID", { schemeID: "VA" }).txt(vat);
}

export function toCii(input: EInvoiceInput): string {
  const kind = input.kind;
  const views = lineViews(input);
  const breakdown = taxBreakdown(input, views);
  const cur = input.currency.toUpperCase();
  const doc = create({ version: "1.0", encoding: "UTF-8" });
  const root = doc.ele("rsm:CrossIndustryInvoice", {
    "xmlns:rsm": NS.rsm,
    "xmlns:ram": NS.ram,
    "xmlns:qdt": NS.qdt,
    "xmlns:udt": NS.udt,
  });
  root
    .ele("rsm:ExchangedDocumentContext")
    .ele("ram:GuidelineSpecifiedDocumentContextParameter")
    .ele("ram:ID")
    .txt(CII_GUIDELINE);

  const header = root.ele("rsm:ExchangedDocument");
  header.ele("ram:ID").txt(input.number);
  header.ele("ram:TypeCode").txt(kind === "CREDIT_NOTE" ? "381" : "380");
  dateTime(header, "IssueDateTime", input.issueDate);
  if (input.notes) header.ele("ram:IncludedNote").ele("ram:Content").txt(input.notes);

  const tx = root.ele("rsm:SupplyChainTradeTransaction");
  for (const v of views) {
    const li = tx.ele("ram:IncludedSupplyChainTradeLineItem");
    li.ele("ram:AssociatedDocumentLineDocument").ele("ram:LineID").txt(String(v.line.position));
    const product = li.ele("ram:SpecifiedTradeProduct");
    if (v.line.sku) product.ele("ram:SellerAssignedID").txt(v.line.sku);
    product.ele("ram:Name").txt(v.line.description);
    li.ele("ram:SpecifiedLineTradeAgreement")
      .ele("ram:NetPriceProductTradePrice")
      .ele("ram:ChargeAmount")
      .txt(money(v.line.unitPrice));
    li.ele("ram:SpecifiedLineTradeDelivery")
      .ele("ram:BilledQuantity", { unitCode: unitCode(v.line.unitType) })
      .txt(D(v.line.quantity).toFixed(3));
    const settlement = li.ele("ram:SpecifiedLineTradeSettlement");
    const tax = settlement.ele("ram:ApplicableTradeTax");
    tax.ele("ram:TypeCode").txt("VAT");
    tax.ele("ram:CategoryCode").txt(v.category);
    tax.ele("ram:RateApplicablePercent").txt(D(v.line.taxRate).toFixed(2));
    settlement
      .ele("ram:SpecifiedTradeSettlementLineMonetarySummation")
      .ele("ram:LineTotalAmount")
      .txt(money(v.gross));
  }

  const agreement = tx.ele("ram:ApplicableHeaderTradeAgreement");
  if (input.buyerReference) agreement.ele("ram:BuyerReference").txt(input.buyerReference);
  party(agreement, "SellerTradeParty", input.issuer);
  party(agreement, "BuyerTradeParty", input.client);
  if (input.poReference) {
    agreement
      .ele("ram:BuyerOrderReferencedDocument")
      .ele("ram:IssuerAssignedID")
      .txt(input.poReference);
  }
  tx.ele("ram:ApplicableHeaderTradeDelivery");

  const settlement = tx.ele("ram:ApplicableHeaderTradeSettlement");
  settlement.ele("ram:InvoiceCurrencyCode").txt(cur);
  const bank = input.paymentMethods.find((m) => m.type === "BANK_TRANSFER");
  if (bank && kind === "INVOICE") {
    const line = (label: string) => bank.lines.find((l) => l.label === label)?.value;
    const iban = line("IBAN");
    const account = line("Account number");
    const bic = line("SWIFT/BIC");
    const means = settlement.ele("ram:SpecifiedTradeSettlementPaymentMeans");
    means.ele("ram:TypeCode").txt(paymentMeansCode(Boolean(iban)));
    means.ele("ram:Information").txt(bank.name);
    const acct = means.ele("ram:PayeePartyCreditorFinancialAccount");
    if (iban) acct.ele("ram:IBANID").txt(iban);
    else if (account) acct.ele("ram:ProprietaryID").txt(account);
    const holder = line("Account holder");
    if (holder) acct.ele("ram:AccountName").txt(holder);
    if (bic) means.ele("ram:PayeeSpecifiedCreditorFinancialInstitution").ele("ram:BICID").txt(bic);
  }
  for (const row of breakdown) {
    const tax = settlement.ele("ram:ApplicableTradeTax");
    tax.ele("ram:CalculatedAmount").txt(money(row.tax));
    tax.ele("ram:TypeCode").txt("VAT");
    const reason = vatExemptionReason(row.category);
    if (reason) tax.ele("ram:ExemptionReason").txt(reason.text);
    tax.ele("ram:BasisAmount").txt(money(row.basis));
    tax.ele("ram:CategoryCode").txt(row.category);
    if (reason) tax.ele("ram:ExemptionReasonCode").txt(reason.code);
    tax.ele("ram:RateApplicablePercent").txt(D(row.rate).toFixed(2));
  }
  const discount = D(input.totals.discountAmount);
  if (discount.gt(0)) {
    const ac = settlement.ele("ram:SpecifiedTradeAllowanceCharge");
    ac.ele("ram:ChargeIndicator").ele("udt:Indicator").txt("false");
    ac.ele("ram:ActualAmount").txt(money(discount));
    ac.ele("ram:Reason").txt("Discount");
    const first = breakdown[0];
    const tax = ac.ele("ram:CategoryTradeTax");
    tax.ele("ram:TypeCode").txt("VAT");
    tax.ele("ram:CategoryCode").txt(first?.category ?? "S");
    tax.ele("ram:RateApplicablePercent").txt(D(first?.rate ?? "0").toFixed(2));
  }
  const terms = settlement.ele("ram:SpecifiedTradePaymentTerms");
  if (input.terms) terms.ele("ram:Description").txt(input.terms);
  if (input.dueDate && kind === "INVOICE") dateTime(terms, "DueDateDateTime", input.dueDate);

  const sum = settlement.ele("ram:SpecifiedTradeSettlementHeaderMonetarySummation");
  sum.ele("ram:LineTotalAmount").txt(money(input.totals.subtotal));
  if (discount.gt(0)) sum.ele("ram:AllowanceTotalAmount").txt(money(discount));
  sum.ele("ram:TaxBasisTotalAmount").txt(money(input.totals.taxableAmount));
  sum.ele("ram:TaxTotalAmount", { currencyID: cur }).txt(money(input.totals.taxAmount));
  const rounding = D(input.totals.roundingAdjustment);
  if (!rounding.isZero()) sum.ele("ram:RoundingAmount").txt(money(rounding));
  sum.ele("ram:GrandTotalAmount").txt(money(input.totals.total));
  sum.ele("ram:TotalPrepaidAmount").txt("0.00");
  sum.ele("ram:DuePayableAmount").txt(money(input.totals.total));
  if (kind === "CREDIT_NOTE" && input.creditedInvoice) {
    const ref = settlement.ele("ram:InvoiceReferencedDocument");
    ref.ele("ram:IssuerAssignedID").txt(input.creditedInvoice.number);
    ref
      .ele("ram:FormattedIssueDateTime")
      .ele("qdt:DateTimeString", { format: "102" })
      .txt(date102(input.creditedInvoice.issueDate));
  }
  return doc.end({ prettyPrint: true });
}
