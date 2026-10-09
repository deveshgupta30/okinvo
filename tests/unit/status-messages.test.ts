import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en-US.json";

/**
 * Settings → Status renders the SMTP line from `settings.status.smtp.configured` with exactly
 * the arguments the page passes; the select on `source` must resolve to words, not to
 * unresolved placeholders.
 */
describe("settings.status.smtp.configured", () => {
  const t = createTranslator({
    locale: "en-US",
    messages,
    namespace: "settings.status",
    onError: (e) => {
      throw e;
    },
  });
  it("names the source for each select branch", () => {
    const args = { lastTest: "never", sent: 2, failed: 0 };
    expect(t("smtp.configured", { source: "settings", ...args })).toContain("SMTP from settings");
    expect(t("smtp.configured", { source: "env", ...args })).toContain("SMTP from env");
    expect(t("smtp.configured", { source: "none", ...args })).toContain("SMTP from  ·");
  });
});
