import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "okinvo", description: "Self-hosted invoicing" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
