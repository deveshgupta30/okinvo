/**
 * Navigation helpers for localised code (spec §8.1). okinvo keeps one URL space for every
 * language (the locale lives on the user, the cookie or the browser, never in the path), so the
 * App Router's own helpers are the right ones; this module exists so a later locale-prefixed
 * routing could swap them in one place.
 */
export { default as Link } from "next/link";
export { redirect, permanentRedirect, usePathname, useRouter } from "next/navigation";
