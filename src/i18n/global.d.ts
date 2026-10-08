import type messages from "../../messages/en-US.json";

/** Type-safe message keys: `t("…")` only accepts keys that exist in the en-US catalogue. */
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
