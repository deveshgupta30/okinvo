import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDER_HELP,
  buildMailto,
  renderTemplate,
  textToHtml,
  type TemplateVars,
} from "@/lib/email/templates";

const VARS: TemplateVars = {
  number: "INV/26-27/001",
  issuerName: "Acme Studio",
  clientName: "Globex Corp",
  contactPerson: "Jane Doe",
  issueDate: "1 Apr 2026",
  dueDate: "15 Apr 2026",
  total: "₹12,34,567.00",
  balanceDue: "₹12,34,567.00",
  currency: "INR",
  paymentTerms: "Net 14",
  verifyUrl: "https://invoices.example.com/verify/abc123",
};

describe("renderTemplate", () => {
  it("substitutes known placeholders", () => {
    expect(renderTemplate("Invoice {{number}} from {{issuerName}}", VARS)).toBe(
      "Invoice INV/26-27/001 from Acme Studio",
    );
  });
  it("replaces every occurrence", () => {
    expect(renderTemplate("{{number}} / {{number}}", { number: "X" })).toBe("X / X");
  });
  it("leaves unknown tokens verbatim so mistakes are obvious", () => {
    expect(renderTemplate("Hi {{nope}}, see {{number}}", { number: "X" })).toBe(
      "Hi {{nope}}, see X",
    );
  });
  it("leaves a known token verbatim when its value is not supplied", () => {
    expect(renderTemplate("Due {{dueDate}}", { number: "X" })).toBe("Due {{dueDate}}");
  });
  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{ number }} and {{number }}", { number: "X" })).toBe("X and X");
  });
  it("does not interpret the substituted values", () => {
    expect(renderTemplate("{{clientName}}", { clientName: "{{number}}" })).toBe("{{number}}");
  });
  it("renders the built-in templates completely with a full set of vars", () => {
    for (const template of Object.values(DEFAULT_TEMPLATES)) {
      const out = renderTemplate(template, VARS);
      expect(out).not.toMatch(/\{\{/);
    }
    expect(renderTemplate(DEFAULT_TEMPLATES.invoiceSubject, VARS)).toContain("INV/26-27/001");
    expect(renderTemplate(DEFAULT_TEMPLATES.invoiceBody, VARS)).toContain(VARS.verifyUrl);
    expect(renderTemplate(DEFAULT_TEMPLATES.creditNoteSubject, VARS)).toContain("INV/26-27/001");
    expect(renderTemplate(DEFAULT_TEMPLATES.creditNoteBody, VARS)).toContain("Acme Studio");
  });
});

describe("DEFAULT_TEMPLATES", () => {
  it("are plain text with no markup", () => {
    for (const template of Object.values(DEFAULT_TEMPLATES)) {
      expect(template).not.toMatch(/<[a-z]/i);
    }
  });
});

describe("textToHtml", () => {
  it("escapes HTML", () => {
    expect(textToHtml("Hello <script>alert(1)</script>")).toBe(
      "<p>Hello &lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
    expect(textToHtml(`Tom & Jerry's "show"`)).toBe(
      "<p>Tom &amp; Jerry&#39;s &quot;show&quot;</p>",
    );
  });
  it("splits paragraphs on blank lines and breaks single newlines", () => {
    expect(textToHtml("Line one\nLine two\n\nPara two")).toBe(
      "<p>Line one<br>Line two</p>\n<p>Para two</p>",
    );
  });
  it("accepts CRLF input and collapses runs of blank lines", () => {
    expect(textToHtml("A\r\nB\r\n\r\n\r\nC")).toBe("<p>A<br>B</p>\n<p>C</p>");
    expect(textToHtml("A\n   \nB")).toBe("<p>A</p>\n<p>B</p>");
  });
  it("autolinks http(s) URLs with an escaped href and a noopener rel", () => {
    expect(textToHtml("See https://x.y/z?a=1&b=2 now")).toBe(
      '<p>See <a href="https://x.y/z?a=1&amp;b=2" rel="noopener noreferrer">https://x.y/z?a=1&amp;b=2</a> now</p>',
    );
    expect(textToHtml("http://example.com")).toBe(
      '<p><a href="http://example.com" rel="noopener noreferrer">http://example.com</a></p>',
    );
  });
  it("leaves trailing sentence punctuation outside the link", () => {
    expect(textToHtml("Visit https://example.com.")).toBe(
      '<p>Visit <a href="https://example.com" rel="noopener noreferrer">https://example.com</a>.</p>',
    );
    expect(textToHtml("(see https://example.com/a)")).toBe(
      '<p>(see <a href="https://example.com/a" rel="noopener noreferrer">https://example.com/a</a>)</p>',
    );
  });
  it("does not link other schemes or produce any other markup", () => {
    expect(textToHtml("mailto:a@b.c ftp://x.y **bold** _it_ [l](u)")).toBe(
      "<p>mailto:a@b.c ftp://x.y **bold** _it_ [l](u)</p>",
    );
    expect(textToHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      "<p>&lt;a href=&quot;javascript:alert(1)&quot;&gt;x&lt;/a&gt;</p>",
    );
  });
  it("neutralises a URL that tries to break out of the attribute", () => {
    const out = textToHtml('https://x.y/"onmouseover="alert(1)');
    expect(out).not.toContain('"onmouseover');
    expect(out).toContain("&quot;onmouseover=&quot;alert(1)");
  });
  it("returns an empty string for empty or whitespace-only text", () => {
    expect(textToHtml("")).toBe("");
    expect(textToHtml("\n\n  \n")).toBe("");
  });
});

describe("buildMailto", () => {
  it("encodes subject and body, including newlines and commas", () => {
    expect(
      buildMailto({ to: ["a@x.y"], subject: "Hi there", body: "Line 1\nLine 2, ok & done" }),
    ).toBe("mailto:a@x.y?subject=Hi%20there&body=Line%201%0ALine%202%2C%20ok%20%26%20done");
  });
  it("joins recipients with commas and includes cc/bcc only when present", () => {
    expect(
      buildMailto({
        to: ["a@x.y", "b@x.y"],
        cc: ["c@x.y"],
        bcc: ["d@x.y", "e@x.y"],
        subject: "S",
        body: "B",
      }),
    ).toBe("mailto:a@x.y,b@x.y?subject=S&body=B&cc=c@x.y&bcc=d@x.y,e@x.y");
    expect(buildMailto({ to: ["a@x.y"], cc: [], bcc: [], subject: "S", body: "B" })).toBe(
      "mailto:a@x.y?subject=S&body=B",
    );
  });
  it("handles an empty recipient list", () => {
    expect(buildMailto({ to: [], subject: "S", body: "B" })).toBe("mailto:?subject=S&body=B");
  });
});

describe("PLACEHOLDER_HELP", () => {
  it("documents every placeholder exactly once", () => {
    const keys: (keyof TemplateVars)[] = [
      "number",
      "issuerName",
      "clientName",
      "contactPerson",
      "issueDate",
      "dueDate",
      "total",
      "balanceDue",
      "currency",
      "paymentTerms",
      "verifyUrl",
    ];
    expect(PLACEHOLDER_HELP.map((h) => h.token)).toEqual(keys.map((k) => `{{${k}}}`));
    for (const h of PLACEHOLDER_HELP) expect(h.meaning.length).toBeGreaterThan(0);
  });
});
