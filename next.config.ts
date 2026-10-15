import type { NextConfig } from "next";
import path from "node:path";

/**
 * next-intl reads its request configuration through the `next-intl/config` module id, which
 * `createNextIntlPlugin()` would alias to this file. The plugin is not used because it loads
 * `@swc/core`'s native binding at config time (for its optional message extractor), and SWC
 * 1.16 refuses to materialise that binding on a Windows profile whose ACL grants an app
 * container SID full control, which breaks `next dev` on such machines. The alias is all okinvo
 * needs, so it is set here for both bundlers; spec §8.1.
 */
const I18N_REQUEST_CONFIG = "./src/i18n/request.ts";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname, // a stray lockfile in $HOME must not widen the trace
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true, remotePatterns: [] }, // every image is served through /api/assets (v2 §11.3); no remote images
  serverExternalPackages: ["@react-pdf/renderer", "pino", "sharp"],
  experimental: {
    authInterrupts: true, // forbidden() / unauthorized() in requireOwner
    optimizePackageImports: ["lucide-react", "radix-ui"],
  },
  // Dev only: Playwright and curl address the dev server as 127.0.0.1; without this Next blocks the
  // HMR channel for that origin and Turbopack's client runtime never finishes hydrating.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    resolveAlias: { "next-intl/config": I18N_REQUEST_CONFIG },
  },
  webpack(config) {
    config.resolve.alias["next-intl/config"] = path.resolve(
      import.meta.dirname,
      I18N_REQUEST_CONFIG,
    );
    return config;
  },
};

export default nextConfig;
