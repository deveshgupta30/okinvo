/**
 * Email templates and the composer's pure helpers (SPEC.md §4.16, v2 §12.4). Templates are plain
 * text with `{{placeholder}}` tokens; the outgoing HTML part is generated from the text by
 * `textToHtml` (escaped, paragraphs and links only - no remote images, no tracking, no other
 * markup). Nothing here sends anything.
 */

export type TemplateVars = Record<
  | "number"
  | "issuerName"
  | "clientName"
  | "contactPerson"
  | "issueDate"
  | "dueDate"
  | "total"
  | "balanceDue"
  | "currency"
  | "paymentTerms"
  | "verifyUrl",
  string
>;

export const PLACEHOLDER_HELP: { token: string; meaning: string }[] = [
  { token: "{{number}}", meaning: "Document number, e.g. INV/26-27/001" },
  { token: "{{issuerName}}", meaning: "Issuer profile's legal name" },
  { token: "{{clientName}}", meaning: "Client's display name" },
  { token: "{{contactPerson}}", meaning: "Contact person on the client record" },
  { token: "{{issueDate}}", meaning: "Issue date, formatted for the issuer's locale" },
  { token: "{{dueDate}}", meaning: "Due date, formatted for the issuer's locale" },
  { token: "{{total}}", meaning: "Document total with currency" },
  { token: "{{balanceDue}}", meaning: "Outstanding balance with currency" },
  { token: "{{currency}}", meaning: "ISO 4217 currency code" },
  { token: "{{paymentTerms}}", meaning: "Payment terms text from the document" },
  { token: "{{verifyUrl}}", meaning: "Public verification link for the document" },
];

const TEMPLATE_KEYS: ReadonlySet<string> = new Set(
  PLACEHOLDER_HELP.map((h) => h.token.slice(2, -2)),
);

export const DEFAULT_TEMPLATES: Readonly<
  Record<"invoiceSubject" | "invoiceBody" | "creditNoteSubject" | "creditNoteBody", string>
> = {
  invoiceSubject: "Invoice {{number}} from {{issuerName}}",
  invoiceBody: [
    "Dear {{contactPerson}},",
    "",
    "Please find attached invoice {{number}} dated {{issueDate}} for {{total}}.",
    "Payment of {{balanceDue}} is due by {{dueDate}} ({{paymentTerms}}).",
    "",
    "You can verify this document at {{verifyUrl}}",
    "",
    "Thank you,",
    "{{issuerName}}",
  ].join("\n"),
  creditNoteSubject: "Credit note {{number}} from {{issuerName}}",
  creditNoteBody: [
    "Dear {{contactPerson}},",
    "",
    "Please find attached credit note {{number}} dated {{issueDate}} for {{total}}.",
    "",
    "You can verify this document at {{verifyUrl}}",
    "",
    "Thank you,",
    "{{issuerName}}",
  ].join("\n"),
};

const TOKEN_RE = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

/**
 * Substitute `{{token}}` placeholders. Unknown tokens, and known tokens without a supplied value,
 * are left verbatim so mistakes are visible in the composer. Substituted values are not re-scanned.
 */
export function renderTemplate(template: string, vars: Partial<TemplateVars>): string {
  return template.replace(TOKEN_RE, (match, name: string) => {
    if (!TEMPLATE_KEYS.has(name)) return match;
    const value = vars[name as keyof TemplateVars];
    return value === undefined ? match : value;
  });
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

const URL_RE = /https?:\/\/[^\s<>"']+/g;
const SENTENCE_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?"]);

/** Drop trailing sentence punctuation and an unbalanced closing parenthesis from a matched URL. */
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1] ?? "";
    if (SENTENCE_PUNCTUATION.has(last)) {
      end -= 1;
    } else if (last === ")") {
      const head = url.slice(0, end);
      const opens = head.split("(").length - 1;
      const closes = head.split(")").length - 1;
      if (closes <= opens) break;
      end -= 1;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

function paragraphToHtml(paragraph: string): string {
  let html = "";
  let last = 0;
  for (const match of paragraph.matchAll(URL_RE)) {
    const url = trimUrl(match[0]);
    const escaped = escapeHtml(url);
    html += escapeHtml(paragraph.slice(last, match.index));
    html += `<a href="${escaped}" rel="noopener noreferrer">${escaped}</a>`;
    last = match.index + url.length;
  }
  html += escapeHtml(paragraph.slice(last));
  return html.replace(/\n/g, "<br>");
}

/**
 * Plain text → minimal HTML: entities escaped, blank lines separate `<p>` paragraphs, single
 * newlines become `<br>`, http(s) URLs become `<a rel="noopener noreferrer">` links. No other
 * markup is ever produced.
 */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n(?:[ \t]*\n)+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${paragraphToHtml(p)}</p>`)
    .join("\n");
}

/** `mailto:` link for the no-SMTP flow; subject and body are percent-encoded, recipients joined by commas. */
export function buildMailto(p: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}): string {
  const params = [`subject=${encodeURIComponent(p.subject)}`, `body=${encodeURIComponent(p.body)}`];
  if (p.cc?.length) params.push(`cc=${p.cc.join(",")}`);
  if (p.bcc?.length) params.push(`bcc=${p.bcc.join(",")}`);
  return `mailto:${p.to.join(",")}?${params.join("&")}`;
}
