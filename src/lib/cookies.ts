/**
 * Every cookie okinvo sets, in one place: the cookie policy page, the cookie notice and the
 * Account → Privacy card all read this list (spec §6.3). All of them are strictly necessary; the
 * app sets no analytics or tracking cookies.
 */
export interface AppCookie {
  name: string;
  purpose: string;
  lifetime: string;
  kind: "necessary";
}

export const APP_COOKIES: readonly AppCookie[] = [
  {
    name: "better-auth.session_token",
    purpose: "Keeps you signed in (the session). Sent only to this site.",
    lifetime: "30 days, extended while you use the app",
    kind: "necessary",
  },
  {
    name: "okinvo.theme",
    purpose: "Your theme choice (system, light or dark) so the first paint is right.",
    lifetime: "1 year",
    kind: "necessary",
  },
  {
    name: "okinvo.accent",
    purpose: "Your accent colour.",
    lifetime: "1 year",
    kind: "necessary",
  },
  {
    name: "okinvo.sidebar",
    purpose: "Whether the sidebar is collapsed.",
    lifetime: "1 year",
    kind: "necessary",
  },
  {
    name: "okinvo.locale",
    purpose: "Your language.",
    lifetime: "1 year",
    kind: "necessary",
  },
  {
    name: "okinvo.cookie-notice",
    purpose: "Remembers that you have seen the cookie notice.",
    lifetime: "1 year",
    kind: "necessary",
  },
  {
    name: "okinvo.share.<link>",
    purpose: "After entering a share link's password, lets you view that one document for an hour.",
    lifetime: "1 hour",
    kind: "necessary",
  },
];
