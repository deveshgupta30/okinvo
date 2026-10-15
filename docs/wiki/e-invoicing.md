---
title: E-invoicing
path: e-invoicing
order: 16
description: India GST e-invoice JSON and IRN registration, EN 16931 CII and UBL, Factur-X PDF/A-3
---

# E-invoicing

Configured per issuer profile under Settings > E-invoicing.

![Settings > E-invoicing](assets/settings-einvoicing-light.png)

## India: GST e-invoice (INV-01)

With e-invoicing enabled on a profile that has a GSTIN, every issued invoice under India GST
offers the e-invoice JSON (schema INV-01 v1.1), built from the issue-time snapshots: supply
type, both parties with the structured address frozen at issue, items with HSN and UQC units,
the discount apportioned over the lines, CGST/SGST or IGST, totals that reconcile with the
invoice, and the export details under LUT.

**Registering the IRN** goes through the profile's connector:

- **Manual**: download the JSON, register it on the portal or through your GSP, and paste the
  response (IRN, acknowledgement number and date, signed QR) on the invoice.
- **NIC**: the NIC IRP API, sandbox or production, with the GSP credentials and the IRP public
  key stored encrypted. The connector follows the published protocol and the recorded fixtures;
  it has not yet been exercised against a live sandbox.

A registered invoice prints the IRN, the acknowledgement and the portal's signed QR in place of
the okinvo verification QR, and the stored PDF is regenerated as a new version so the archive
carries it. Cancellation is allowed within 24 hours with the portal's reason codes; a cancelled
IRN prints an "E-INVOICE CANCELLED" stamp and is never registered again (void and reissue
instead). The register filters by registration state.

## EU and UK: EN 16931

With the profile's EU profile set to **EN 16931**, every issued invoice and credit note also
offers:

- **CII XML**: UN/CEFACT Cross Industry Invoice, Factur-X EN16931 profile.
- **UBL XML**: Peppol BIS Billing 3.0, UBL 2.1 `Invoice` or `CreditNote`.
- **Factur-X PDF**: the canonical PDF assembled as PDF/A-3b with the CII XML embedded, stored as
  its own document version, validated with veraPDF in the test suite, available on the page,
  through the API and as an option of the documents ZIP.

Both XML flavours are built from the same snapshots: Rec 20 unit codes, UNCL 5305 tax
categories (standard, zero, exempt, reverse charge with the VATEX reason, export under LUT,
not subject), the parties' electronic addresses with their scheme, the bank account as payment
means, the invoice-level discount as an allowance, and a VAT breakdown whose amounts equal the
invoice totals. A credit note becomes one line per taxable amount described by its reason and
references the invoice it corrects.

Downloads only: nothing is sent to an access point.

Related: [Invoices](invoices.md), [Settings](settings.md#e-invoicing).
