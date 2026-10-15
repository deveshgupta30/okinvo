import {
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  randomBytes,
  constants,
} from "node:crypto";
import {
  CANCEL_REASONS,
  EInvoiceError,
  type CancelReason,
  type IrpConnector,
  type IrpResult,
} from "./connector";
import { parseIrpResponse } from "./manual";
import type { GstEInvoice } from "./schema";

/**
 * The NIC Invoice Registration Portal API (e-invoice API v1.04 auth, v1.03 invoice; spec §9e).
 * Protocol as published by NIC: the credentials are RSA-OAEP encrypted with the IRP's public
 * key and sent with the GSP's client id and secret; the IRP answers with an AES-256-ECB
 * (PKCS7) encrypted session key (`Sek`, itself wrapped with the app key) and a token; every
 * later request body is `{ Data: base64(AES-ECB(sek, json)) }` and every reply decrypts the
 * same way. Implemented against the published protocol and recorded fixtures only: it is
 * unverified against a live sandbox until credentials are supplied.
 */
export interface NicConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  gstin: string;
  /** The IRP's RSA public key (PEM), downloaded from the portal after login. */
  publicKeyPem: string;
  fetch?: typeof fetch;
  now?: () => Date;
  /** The 32-byte app key; random per session unless a test pins it. */
  appKey?: Buffer;
}

const AUTH_PATH = "/eivital/v1.04/auth";
const INVOICE_PATH = "/eicore/v1.03/Invoice";
const CANCEL_PATH = "/eicore/v1.03/Invoice/Cancel";

/** NIC error codes worth a plain message; everything else keeps the portal's text. */
const KNOWN_ERRORS: Record<string, string> = {
  "2150": "Duplicate IRN",
  "2148": "Requested IRN data is not available",
  "1005": "Invalid token",
  "2163": "Invoice date is not within the allowed range",
  "2176": "Invalid HSN code",
  "2283": "IRN cannot be cancelled after 24 hours",
};

export function aesEcbEncrypt(key: Buffer, plaintext: Buffer | string): Buffer {
  const cipher = createCipheriv("aes-256-ecb", key, null);
  return Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
}

export function aesEcbDecrypt(key: Buffer, ciphertext: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function rsaOaepEncrypt(publicKeyPem: string, plaintext: Buffer | string): Buffer {
  return publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" },
    Buffer.from(plaintext),
  );
}

interface Session {
  authToken: string;
  sek: Buffer;
  expiresAt: number;
}

export class NicConnector implements IrpConnector {
  private session: Session | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly appKey: Buffer;

  constructor(private readonly config: NicConfig) {
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.appKey = config.appKey ?? randomBytes(32);
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "content-type": "application/json",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      Gstin: this.config.gstin,
      ...extra,
    };
  }

  private async post(
    path: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new EInvoiceError(`NIC IRP unreachable: ${(e as Error).message}`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new EInvoiceError(`NIC IRP answered ${res.status} without JSON`);
    }
    if (!json || typeof json !== "object") throw new EInvoiceError("NIC IRP: unexpected reply");
    const reply = json as Record<string, unknown>;
    if (Number(reply.Status) !== 1) throw this.errorOf(reply, res.status);
    return reply;
  }

  private errorOf(reply: Record<string, unknown>, status: number): EInvoiceError {
    let details: unknown = reply.ErrorDetails;
    if (typeof details === "string") {
      const raw: string = details;
      try {
        details = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      } catch {
        try {
          details = JSON.parse(raw);
        } catch {
          details = [{ ErrorCode: "", ErrorMessage: raw }];
        }
      }
    }
    const first = Array.isArray(details)
      ? (details[0] as Record<string, unknown> | undefined)
      : undefined;
    const code = first?.ErrorCode !== undefined ? String(first.ErrorCode) : undefined;
    const message =
      (code && KNOWN_ERRORS[code]) ||
      (typeof first?.ErrorMessage === "string"
        ? first.ErrorMessage
        : `NIC IRP error (HTTP ${status})`);
    return new EInvoiceError(message, code);
  }

  /** Authenticates (or reuses a live session); the session key decrypts every later reply. */
  async auth(): Promise<Session> {
    if (this.session && this.session.expiresAt - 60_000 > this.now().getTime()) return this.session;
    const payload = {
      UserName: this.config.username,
      Password: this.config.password,
      AppKey: this.appKey.toString("base64"),
      ForceRefreshAccessToken: false,
    };
    const data = rsaOaepEncrypt(this.config.publicKeyPem, JSON.stringify(payload)).toString(
      "base64",
    );
    const reply = await this.post(AUTH_PATH, this.headers(), { Data: data });
    const decrypted = this.decryptWith(this.appKey, reply.Data);
    const authToken = typeof decrypted.AuthToken === "string" ? decrypted.AuthToken : "";
    const sekWrapped = typeof decrypted.Sek === "string" ? decrypted.Sek : "";
    if (!authToken || !sekWrapped)
      throw new EInvoiceError("NIC IRP: auth reply lacks a token or session key");
    const sek = aesEcbDecrypt(this.appKey, Buffer.from(sekWrapped, "base64"));
    const expiry =
      typeof decrypted.TokenExpiry === "string" ? Date.parse(decrypted.TokenExpiry) : NaN;
    this.session = {
      authToken,
      sek,
      expiresAt: Number.isNaN(expiry) ? this.now().getTime() + 5 * 60 * 60 * 1000 : expiry,
    };
    return this.session;
  }

  private decryptWith(key: Buffer, data: unknown): Record<string, unknown> {
    if (typeof data !== "string") throw new EInvoiceError("NIC IRP: reply carries no Data");
    let text: string;
    try {
      text = aesEcbDecrypt(key, Buffer.from(data, "base64")).toString("utf8");
    } catch {
      throw new EInvoiceError("NIC IRP: reply could not be decrypted with the session key");
    }
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object")
      throw new EInvoiceError("NIC IRP: reply is not an object");
    return value as Record<string, unknown>;
  }

  private async call(path: string, body: unknown): Promise<Record<string, unknown>> {
    const session = await this.auth();
    const data = aesEcbEncrypt(session.sek, JSON.stringify(body)).toString("base64");
    const reply = await this.post(
      path,
      this.headers({ AuthToken: session.authToken, user_name: this.config.username }),
      { Data: data },
    );
    return this.decryptWith(session.sek, reply.Data);
  }

  async generate(payload: GstEInvoice): Promise<IrpResult> {
    return parseIrpResponse(await this.call(INVOICE_PATH, payload));
  }

  async cancel(irn: string, reason: CancelReason, remarks: string): Promise<void> {
    if (!(reason in CANCEL_REASONS))
      throw new EInvoiceError(`Unknown cancellation reason ${reason}`);
    const reply = await this.call(CANCEL_PATH, {
      Irn: irn,
      CnlRsn: reason,
      CnlRem: remarks.slice(0, 100),
    });
    if (typeof reply.Irn === "string" && reply.Irn.toLowerCase() !== irn.toLowerCase()) {
      throw new EInvoiceError("NIC IRP: the cancellation reply names another IRN");
    }
  }
}
