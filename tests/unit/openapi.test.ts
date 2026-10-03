import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOpenApi } from "@/lib/api/openapi";
import { SCOPES } from "@/lib/api/scopes";

/** The OpenAPI document of /api/v1 (spec §7.3). */
type Op = {
  operationId?: string;
  security?: Record<string, string[]>[];
  responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
};

describe("buildOpenApi", () => {
  const doc = buildOpenApi("https://invoices.example.com/") as unknown as {
    openapi: string;
    info: { title: string; version: string };
    servers: { url: string }[];
    paths: Record<string, Record<string, Op>>;
    components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
  };

  it("is OpenAPI 3.1 for this instance with a bearer scheme", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("okinvo API");
    expect(doc.info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(doc.servers[0]?.url).toBe("https://invoices.example.com/api/v1");
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("lists exactly the v1 paths", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(
      [
        "/clients",
        "/credit-notes",
        "/credit-notes/{id}",
        "/credit-notes/{id}/docx",
        "/credit-notes/{id}/issue",
        "/credit-notes/{id}/pdf",
        "/invoices",
        "/invoices/{id}",
        "/invoices/{id}/docx",
        "/invoices/{id}/issue",
        "/invoices/{id}/pdf",
        "/payment-methods",
        "/products",
        "/profiles",
        "/services",
        "/status",
      ].sort(),
    );
  });

  it("every operation names a known scope, has an operationId and uses the error envelope for 4xx", () => {
    const ids = new Set<string>();
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(["get", "post"], `${method} ${path}`).toContain(method);
        expect(op.operationId, `${method} ${path}`).toBeTruthy();
        expect(ids.has(op.operationId!), `duplicate ${op.operationId}`).toBe(false);
        ids.add(op.operationId!);
        const scopes = op.security?.[0]?.bearerAuth ?? [];
        expect(scopes, `${method} ${path} security`).toHaveLength(1);
        expect(SCOPES as readonly string[]).toContain(scopes[0]);
        for (const [status, res] of Object.entries(op.responses ?? {})) {
          if (status.startsWith("4")) {
            expect(
              res.content?.["application/json"]?.schema?.$ref,
              `${method} ${path} ${status}`,
            ).toBe("#/components/schemas/ErrorEnvelope");
          }
        }
      }
    }
    expect(doc.components.schemas).toHaveProperty("Invoice");
    expect(doc.components.schemas).toHaveProperty("InvoiceCreateInput");
    expect(doc.components.schemas).not.toHaveProperty("verificationToken");
  });

  it("the committed openapi/okinvo.json matches the builder", () => {
    const committed = JSON.parse(readFileSync("openapi/okinvo.json", "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApi("https://okinvo.example"))));
  });
});
