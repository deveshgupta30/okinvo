import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";

/**
 * Crawlers are welcome on the public pages only (addendum §2 item 9): the signed-in app, the
 * share viewer, the verification page and the API are kept out, and the sitemap is named.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/auth/sign-in", "/legal/"],
        disallow: [
          "/i/",
          "/verify/",
          "/api/",
          "/auth/error",
          "/onboarding",
          "/settings",
          "/invoices",
          "/credit-notes",
          "/clients",
          "/services",
          "/products",
        ],
      },
    ],
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
