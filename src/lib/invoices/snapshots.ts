import {
  ClientSnapshotSchema,
  IssuerSnapshotSchema,
  PaymentMethodsSnapshotSchema,
  formatAddressLines,
  type Address,
  type ClientSnapshot,
  type DisplayConfig,
  type IssuerSnapshot,
  type PaymentMethodLine,
  type PaymentMethodsSnapshot,
} from "@/lib/schemas";

export interface IssuerForSnapshot {
  type: "INDIVIDUAL" | "COMPANY";
  legalName: string;
  tradeName: string | null;
  designation: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  address: Address;
  countryCode: string;
  stateCode: string | null;
  gstStateCode: string | null;
  panNumber: string | null;
  gstin: string | null;
  cinNumber: string | null;
  ukVatNumber: string | null;
  lutNumber: string | null;
  lutFiscalYear: string | null;
  logoAssetId: string | null;
  signatureAssetId: string | null;
  stampAssetId: string | null;
  locale: string;
  baseCurrency: string;
  electronicAddress?: string | null;
  electronicAddressScheme?: string | null;
}

export interface ClientForSnapshot {
  displayName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: Address;
  shippingAddress: Address | null;
  countryCode: string;
  stateCode: string | null;
  gstStateCode: string | null;
  taxIdType: "GSTIN" | "VAT" | "EIN" | "OTHER" | null;
  taxId: string | null;
  paymentTermsDays: number;
  buyerReference?: string | null;
  electronicAddress?: string | null;
  electronicAddressScheme?: string | null;
}

export interface MethodForSnapshot {
  name: string;
  type: PaymentMethodsSnapshot[number]["type"];
  instructions: string | null;
  lines: PaymentMethodLine[];
}

const opt = (on: boolean, v: string | null | undefined) => (on && v ? v : undefined);

/**
 * What the renderer may ever see. Fields the display config hid at issue time are not stored, so a
 * later "show PAN" toggle cannot retroactively leak into a regenerated document (v2 §7.3).
 */
export function buildSnapshots(p: {
  issuer: IssuerForSnapshot;
  client: ClientForSnapshot;
  methods: MethodForSnapshot[];
  display: DisplayConfig;
  lutApplies: boolean;
}): { issuer: IssuerSnapshot; client: ClientSnapshot; paymentMethods: PaymentMethodsSnapshot } {
  const { issuer: i, client: c, display: d } = p;
  const issuer = IssuerSnapshotSchema.parse({
    type: i.type,
    legalName: i.legalName,
    tradeName: opt(d.issuer.showTradeName, i.tradeName),
    designation: opt(d.issuer.showDesignation, i.designation),
    email: opt(d.issuer.showEmail, i.email),
    phone: opt(d.issuer.showPhone, i.phone),
    website: opt(d.issuer.showWebsite, i.website),
    addressLines: d.issuer.showFullAddress
      ? formatAddressLines(i.address)
      : formatAddressLines({
          line1: i.address.city,
          city: i.address.city,
          countryCode: i.countryCode,
        }).slice(1),
    countryCode: i.countryCode,
    stateCode: i.stateCode ?? undefined,
    gstStateCode: i.gstStateCode ?? undefined,
    pan: opt(d.issuer.showPan, i.panNumber),
    gstin: opt(d.issuer.showGstin, i.gstin),
    cin: opt(d.issuer.showCin, i.cinNumber),
    ukVatNumber: i.ukVatNumber ?? undefined,
    lutNumber: opt(d.issuer.showLut && p.lutApplies, i.lutNumber),
    lutFiscalYear: opt(d.issuer.showLut && p.lutApplies, i.lutFiscalYear),
    logoAssetId: opt(d.issuer.showLogo, i.logoAssetId),
    signatureAssetId: opt(d.issuer.showSignature, i.signatureAssetId),
    stampAssetId: opt(d.issuer.showStamp, i.stampAssetId),
    locale: i.locale,
    baseCurrency: i.baseCurrency,
    // e-invoicing reads the full address whatever the print config hides (spec §9e)
    address: i.address,
    electronicAddress: i.electronicAddress ?? undefined,
    electronicAddressScheme: i.electronicAddressScheme ?? undefined,
  });
  const client = ClientSnapshotSchema.parse({
    displayName: c.displayName,
    contactPerson: opt(d.client.showContactPerson, c.contactPerson),
    email: opt(d.client.showEmail, c.email),
    phone: opt(d.client.showPhone, c.phone),
    billingAddressLines: d.client.showBillingAddress ? formatAddressLines(c.billingAddress) : [],
    shippingAddressLines:
      d.client.showShippingAddress && c.shippingAddress
        ? formatAddressLines(c.shippingAddress)
        : undefined,
    countryCode: c.countryCode,
    stateCode: c.stateCode ?? undefined,
    gstStateCode: c.gstStateCode ?? undefined,
    taxIdType: opt(d.client.showTaxIdentifier, c.taxIdType),
    taxId: opt(d.client.showTaxIdentifier, c.taxId),
    paymentTermsDays: c.paymentTermsDays,
    address: c.billingAddress,
    buyerReference: c.buyerReference ?? undefined,
    electronicAddress: c.electronicAddress ?? undefined,
    electronicAddressScheme: c.electronicAddressScheme ?? undefined,
  });
  const paymentMethods = PaymentMethodsSnapshotSchema.parse(
    p.methods.map((m) => ({
      name: m.name,
      type: m.type,
      instructions: m.instructions ?? undefined,
      lines: m.lines,
    })),
  );
  return { issuer, client, paymentMethods };
}
