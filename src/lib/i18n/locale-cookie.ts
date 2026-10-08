/**
 * The UI-language cookie (spec §8.1). It mirrors `User.locale` for the first byte of a response
 * and carries a choice made before sign-in; the request config reads it after the user's stored
 * preference and before `Accept-Language`.
 */
export const LOCALE_COOKIE = "okinvo.locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
