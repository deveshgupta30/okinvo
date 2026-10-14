import { constants, generateKeyPairSync, privateDecrypt, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EInvoiceError } from "@/lib/einvoice/gst/connector";
import { aesEcbDecrypt, aesEcbEncrypt, NicConnector } from "@/lib/einvoice/gst/nic";
import { toGstEInvoice } from "@/lib/einvoice/gst/build";
import { standardInput } from "./gst-einvoice.test";
import { fixtureIrpResponse, FIXTURE_IRN } from "./signed-qr.test";

/**
 * The NIC connector against recorded exchanges (spec §9e): the auth request carries the
 * RSA-OAEP encrypted credentials under the GSP headers, the session key comes back wrapped
 * with the app key, every call body is AES-ECB encrypted with that session key, replies are
 * decrypted the same way, and the IRP's error codes surface as plain messages.
 */
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const sek = randomBytes(32);
const appKey = Buffer.alloc(32, 7);

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeIrp(o: { generateReply?: unknown; cancelReply?: unknown } = {}) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, headers, body });
    const encrypt = (key: Buffer, value: unknown) =>
      aesEcbEncrypt(key, JSON.stringify(value)).toString("base64");
    if (url.endsWith("/eivital/v1.04/auth")) {
      const creds = JSON.parse(
        privateDecrypt(
          { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" },
          Buffer.from(String(body.Data), "base64"),
        ).toString("utf8"),
      ) as { AppKey: string; UserName: string; Password: string };
      const key = Buffer.from(creds.AppKey, "base64");
      const data = encrypt(key, {
        ClientId: headers.client_id,
        UserName: creds.UserName,
        AuthToken: "tok-123",
        Sek: aesEcbEncrypt(key, sek).toString("base64"),
        TokenExpiry: "2099-01-01T00:00:00+05:30",
      });
      return Response.json({ Status: 1, Data: data });
    }
    if (url.endsWith("/eicore/v1.03/Invoice/Cancel")) {
      const reply = o.cancelReply ?? {
        Status: 1,
        Data: encrypt(sek, { Irn: FIXTURE_IRN, CancelDate: "2026-04-15 11:00:00" }),
      };
      return Response.json(reply);
    }
    if (url.endsWith("/eicore/v1.03/Invoice")) {
      const reply = o.generateReply ?? { Status: 1, Data: encrypt(sek, fixtureIrpResponse()) };
      return Response.json(reply);
    }
    return Response.json({ Status: 0 }, { status: 404 });
  };
  return { calls, fetchImpl };
}

const connector = (fetchImpl: typeof fetch) =>
  new NicConnector({
    baseUrl: "https://einv-apisandbox.nic.in",
    clientId: "gsp-client",
    clientSecret: "gsp-secret",
    username: "api-user",
    password: "api-pass",
    gstin: "29ABCDE1234F1Z5",
    publicKeyPem,
    fetch: fetchImpl,
    appKey,
  });

describe("NicConnector", () => {
  it("authenticates with encrypted credentials under the GSP headers and unwraps the session key", async () => {
    const irp = fakeIrp();
    const session = await connector(irp.fetchImpl).auth();
    expect(session.authToken).toBe("tok-123");
    expect(session.sek.equals(sek)).toBe(true);
    const auth = irp.calls[0]!;
    expect(auth.url).toBe("https://einv-apisandbox.nic.in/eivital/v1.04/auth");
    expect(auth.headers.client_id).toBe("gsp-client");
    expect(auth.headers.client_secret).toBe("gsp-secret");
    expect(auth.headers.gstin).toBe("29ABCDE1234F1Z5");
    expect(Object.keys(auth.body)).toEqual(["Data"]);
    const creds = JSON.parse(
      privateDecrypt(
        { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" },
        Buffer.from(String(auth.body.Data), "base64"),
      ).toString("utf8"),
    );
    expect(creds).toEqual({
      UserName: "api-user",
      Password: "api-pass",
      AppKey: appKey.toString("base64"),
      ForceRefreshAccessToken: false,
    });
  });

  it("encrypts the INV-01 payload with the session key and parses the registration reply", async () => {
    const irp = fakeIrp();
    const result = await connector(irp.fetchImpl).generate(toGstEInvoice(standardInput()));
    expect(result.irn).toBe(FIXTURE_IRN);
    expect(result.ackNo).toBe("112010000000001");
    expect(result.ackDate).toBe("2026-04-15T05:00:00.000Z");
    const call = irp.calls[1]!;
    expect(call.url).toBe("https://einv-apisandbox.nic.in/eicore/v1.03/Invoice");
    expect(call.headers.authtoken).toBe("tok-123");
    expect(call.headers.user_name).toBe("api-user");
    const sent = JSON.parse(
      aesEcbDecrypt(sek, Buffer.from(String(call.body.Data), "base64")).toString("utf8"),
    );
    expect(sent.Version).toBe("1.1");
    expect(sent.DocDtls.No).toBe("INV/26-27/007");
    // the session is reused for the next call
    await connector(irp.fetchImpl).auth();
    expect(irp.calls.filter((c) => c.url.endsWith("/auth")).length).toBe(2);
  });

  it("maps the IRP's error list to a plain message with its code", async () => {
    const irp = fakeIrp({
      generateReply: {
        Status: 0,
        ErrorDetails: [{ ErrorCode: "2150", ErrorMessage: "Duplicate IRN" }],
      },
    });
    await expect(
      connector(irp.fetchImpl).generate(toGstEInvoice(standardInput())),
    ).rejects.toMatchObject({
      name: "EInvoiceError",
      code: "2150",
      message: "Duplicate IRN",
    });
    const encoded = fakeIrp({
      generateReply: {
        Status: 0,
        ErrorDetails: Buffer.from(
          JSON.stringify([{ ErrorCode: "2176", ErrorMessage: "x" }]),
        ).toString("base64"),
      },
    });
    await expect(
      connector(encoded.fetchImpl).generate(toGstEInvoice(standardInput())),
    ).rejects.toThrow(/HSN/);
  });

  it("cancels with the reason code and refuses an unknown reason", async () => {
    const irp = fakeIrp();
    const c = connector(irp.fetchImpl);
    await c.cancel(FIXTURE_IRN, "2", "Data entry mistake");
    const call = irp.calls.find((x) => x.url.endsWith("/Cancel"))!;
    const sent = JSON.parse(
      aesEcbDecrypt(sek, Buffer.from(String(call.body.Data), "base64")).toString("utf8"),
    );
    expect(sent).toEqual({ Irn: FIXTURE_IRN, CnlRsn: "2", CnlRem: "Data entry mistake" });
    await expect(c.cancel(FIXTURE_IRN, "9" as never, "x")).rejects.toBeInstanceOf(EInvoiceError);
  });
});
