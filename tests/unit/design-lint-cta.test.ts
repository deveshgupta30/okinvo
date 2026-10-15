import { describe, expect, it } from "vitest";
import { ctaFindings } from "../../scripts/design-lint.mjs";

/**
 * Launch checklist item 20: `pnpm design:lint` fails a page file that offers two primary buttons
 * (the Button default, an explicit variant="primary" or a SubmitButton) or a form with no way to
 * submit; a page whose only form submits through a secondary button is fine.
 */
describe("ctaFindings", () => {
  it("passes one primary button", () => {
    expect(ctaFindings('<Button type="submit">Save</Button>', "a/page.tsx")).toEqual([]);
    expect(ctaFindings("<SubmitButton />", "a/page.tsx")).toEqual([]);
  });
  it("fails a second primary button", () => {
    const src = '<Button>New invoice</Button> ... <Button variant="primary">Issue</Button>';
    expect(ctaFindings(src, "x/page.tsx")).toEqual([
      "x/page.tsx: 2 primary buttons; a view has one call to action",
    ]);
  });
  it("counts asChild links styled as the primary button", () => {
    const src = '<Button asChild><Link href="/invoices/new">New</Link></Button><SubmitButton />';
    expect(ctaFindings(src, "x/page.tsx")).toHaveLength(1);
  });
  it("fails a form that cannot be submitted, accepts a secondary submit", () => {
    expect(ctaFindings("<form><Input name='q' /></form>", "y/page.tsx")).toEqual([
      "y/page.tsx: a form without a submit button",
    ]);
    expect(
      ctaFindings(
        '<form><Button type="submit" variant="secondary">Send</Button></form>',
        "y/page.tsx",
      ),
    ).toEqual([]);
  });
});
