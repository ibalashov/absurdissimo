import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute-URL base for OpenGraph/Twitter metadata on card pages.
  metadataBase: new URL("https://absurdissimo.vercel.app"),
  // The operator's name lives in metadata only — never in page content
  // (VocabCards #337).
  authors: [{ name: "Ivan Balashov" }],
  creator: "Ivan Balashov",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
