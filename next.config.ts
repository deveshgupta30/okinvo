import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true }, // every image is served through /api/assets (v2 §11.3)
  serverExternalPackages: ["@react-pdf/renderer", "pino"], // populated further in M2/M3; harmless now
};

export default nextConfig;
