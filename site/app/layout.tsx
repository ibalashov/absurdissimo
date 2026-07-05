import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute-URL base for OpenGraph/Twitter metadata on card pages.
  metadataBase: new URL("https://absurdissimo.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
