import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/site";

/** The pages a visitor can open without signing in (addendum §2 item 9). */
export const PUBLIC_PATHS: readonly string[] = [
  "/",
  "/auth/sign-in",
  "/legal/terms",
  "/legal/acceptable-use",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/data-retention",
  "/legal/security",
  "/legal/licenses",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  return PUBLIC_PATHS.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path.startsWith("/legal/") ? "monthly" : "weekly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
