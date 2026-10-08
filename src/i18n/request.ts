import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE } from "@/lib/i18n/locale-cookie";
import { loadMessages } from "@/lib/i18n/messages";
import { resolveLocale } from "@/lib/i18n/resolve";
import { getSession } from "@/server/auth";

/**
 * next-intl request configuration (spec §8.1). The locale comes from the signed-in user's
 * stored choice, else the `okinvo.locale` cookie, else the best Accept-Language match, else
 * en-US; URLs carry no locale prefix. Messages are the en-US catalogue with the locale's file
 * laid over it, so a missing key renders English rather than its key.
 */
export default getRequestConfig(async () => {
  const [cookieStore, headerStore, session] = await Promise.all([
    cookies(),
    headers(),
    getSession().catch(() => null),
  ]);
  const locale = resolveLocale({
    user: session?.user.locale,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: session?.user.timezone || "UTC",
    onError(error) {
      // A missing key already renders its English text through the merge; anything else is a bug.
      if (error.code !== "MISSING_MESSAGE") console.error("i18n", error);
    },
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
