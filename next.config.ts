import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname, // a stray lockfile in $HOME must not widen the trace
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true }, // every image is served through /api/assets (v2 §11.3)
  serverExternalPackages: ["@react-pdf/renderer", "pino", "sharp"],
  experimental: { authInterrupts: true }, // forbidden() / unauthorized() in requireOwner
  // Dev only: Playwright and curl address the dev server as 127.0.0.1; without this Next blocks the
  // HMR channel for that origin and Turbopack's client runtime never finishes hydrating.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
