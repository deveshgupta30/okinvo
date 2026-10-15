import { describe, expect, it } from "vitest";
import { EAS, EAS_CODES, easName, isEasCode } from "@/lib/einvoice/eas";
import { ClientInputSchema } from "@/lib/schemas/client-input";
import {
  EInvoiceProfileSettingsInputSchema,
  EInvoiceProfileSettingsSchema,
  EInvoiceSettingsSchema,
  NIC_BASE_URLS,
} from "@/lib/schemas/einvoice-settings";
import { EINVOICE_STATUSES, EInvoiceStateSchema } from "@/lib/schemas/einvoice-state";
import { ProfileInputSchema } from "@/lib/schemas/profile-input";

/**
 * E-invoicing data (spec §9e): the per-document registration state, the per-profile settings
 * with connector credentials stored only as ciphertext, and the Peppol electronic-address
 * schemes clients and issuers identify themselves with.
 */
describe("EInvoiceStateSchema", () => {
  it("accepts the empty state and a registered one", () => {
    expect(EInvoiceStateSchema.parse({ status: "NONE" })).toEqual({ status: "NONE" });
    const registered = EInvoiceStateSchema.parse({
      status: "REGISTERED",
      irn: "a".repeat(64),
      ackNo: "112010000000001",
      ackDate: "2026-04-15T10:30:00.000Z",
      signedQr: "eyJhbGciOiJSUzI1NiJ9.e30.sig",
      connector: "manual",
    });
    expect(registered.irn).toHaveLength(64);
    expect(EINVOICE_STATUSES).toEqual(["NONE", "GENERATED", "REGISTERED", "CANCELLED", "FAILED"]);
  });
  it("rejects an unknown status, a malformed IRN and a cancellation without a reason", () => {
    expect(EInvoiceStateSchema.safeParse({ status: "SENT" }).success).toBe(false);
    expect(EInvoiceStateSchema.safeParse({ status: "REGISTERED", irn: "short" }).success).toBe(
      false,
    );
    expect(
      EInvoiceStateSchema.safeParse({ status: "CANCELLED", irn: "b".repeat(64) }).success,
    ).toBe(false);
    expect(
      EInvoiceStateSchema.safeParse({
        status: "CANCELLED",
        irn: "b".repeat(64),
        cancelledAt: "2026-04-15T12:00:00.000Z",
        cancelReason: "Duplicate",
      }).success,
    ).toBe(true);
  });
});

describe("EInvoiceSettingsSchema", () => {
  it("stores per-profile settings with NIC credentials as ciphertext only", () => {
    const settings = EInvoiceSettingsSchema.parse({
      profiles: {
        p1: {
          india: {
            connector: "nic",
            nic: {
              env: "sandbox",
              baseUrl: NIC_BASE_URLS.sandbox,
              clientId: "client",
              clientSecretEnc: "v1:abc",
              username: "user",
              passwordEnc: "v1:def",
              gstin: "29ABCDE1234F1Z5",
              publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
            },
          },
          eu: { profile: "EN16931" },
        },
      },
    });
    expect(settings.profiles.p1?.india?.nic?.env).toBe("sandbox");
    expect(EInvoiceSettingsSchema.parse({})).toEqual({ profiles: {} });
  });
  it("refuses plaintext credential keys and a NIC connector without credentials", () => {
    expect(
      EInvoiceProfileSettingsSchema.safeParse({
        india: {
          connector: "nic",
          nic: {
            env: "sandbox",
            clientId: "c",
            clientSecret: "plain",
            username: "u",
            gstin: "29ABCDE1234F1Z5",
          },
        },
      }).success,
    ).toBe(false);
    expect(EInvoiceProfileSettingsSchema.safeParse({ india: { connector: "nic" } }).success).toBe(
      false,
    );
    expect(
      EInvoiceProfileSettingsSchema.safeParse({ india: { connector: "manual" } }).success,
    ).toBe(true);
  });
  it("parses the settings form: blank secrets mean keep, the base URL follows the environment", () => {
    const parsed = EInvoiceProfileSettingsInputSchema.parse({
      profileId: "p1",
      indiaConnector: "nic",
      nicEnv: "production",
      nicClientId: "client",
      nicClientSecret: "",
      nicUsername: "user",
      nicPassword: "",
      nicGstin: "29abcde1234f1z5",
      euProfile: "EN16931",
    });
    expect(parsed.nicClientSecret).toBeUndefined();
    expect(parsed.nicGstin).toBe("29ABCDE1234F1Z5");
    expect(NIC_BASE_URLS.production).toMatch(/^https:\/\//);
    expect(
      EInvoiceProfileSettingsInputSchema.safeParse({
        profileId: "p1",
        indiaConnector: "nic",
        nicEnv: "sandbox",
        nicClientId: "",
        nicUsername: "",
        nicGstin: "",
        euProfile: "",
      }).success,
    ).toBe(false);
  });
});

describe("Peppol electronic address schemes", () => {
  it("lists the common EAS codes with names", () => {
    for (const code of [
      "0088",
      "0208",
      "9906",
      "9925",
      "9930",
      "9932",
      "0211",
      "0007",
      "0184",
      "0192",
      "9915",
      "9944",
      "0151",
    ])
      expect(EAS_CODES, code).toContain(code);
    expect(easName("0088")).toMatch(/GLN/);
    expect(isEasCode("9999")).toBe(false);
    expect(new Set(EAS.map((e) => e.code)).size).toBe(EAS.length);
  });
});

describe("client and profile inputs", () => {
  const client = {
    displayName: "Acme",
    billingAddress: { line1: "1 Road", city: "Town", countryCode: "DE" },
    countryCode: "DE",
    currency: "EUR",
    paymentTermsDays: "30",
  };
  it("accepts a buyer reference and an electronic address with its scheme", () => {
    const parsed = ClientInputSchema.parse({
      ...client,
      buyerReference: "PO-2026-7",
      electronicAddress: "DE123456789",
      electronicAddressScheme: "9930",
    });
    expect(parsed.electronicAddressScheme).toBe("9930");
  });
  it("requires the address and the scheme together", () => {
    expect(ClientInputSchema.safeParse({ ...client, electronicAddress: "x" }).success).toBe(false);
    expect(
      ClientInputSchema.safeParse({ ...client, electronicAddressScheme: "0088" }).success,
    ).toBe(false);
    expect(
      ClientInputSchema.safeParse({
        ...client,
        electronicAddressScheme: "1234",
        electronicAddress: "x",
      }).success,
    ).toBe(false);
  });
  it("accepts an issuer electronic address and the e-invoicing switch", () => {
    const base = {
      type: "INDIVIDUAL",
      label: "Main",
      legalName: "Asha Rao",
      email: "asha@example.com",
      address: { line1: "1 Road", city: "Town", countryCode: "IN" },
      countryCode: "IN",
      baseCurrency: "INR",
      locale: "en-IN",
      fiscalYearStartMonth: "4",
      invoiceNumberFormat: "INV/{FY}/{SEQ:3}",
      creditNoteNumberFormat: "CN/{FY}/{SEQ:3}",
      defaultTaxRegime: "INDIA_GST",
    };
    const parsed = ProfileInputSchema.parse({
      ...base,
      electronicAddress: "0088:1234567890123",
      electronicAddressScheme: "0088",
      einvoiceEnabled: "on",
    });
    expect(parsed.einvoiceEnabled).toBe(true);
    expect(ProfileInputSchema.parse(base).einvoiceEnabled).toBe(false);
  });
});
