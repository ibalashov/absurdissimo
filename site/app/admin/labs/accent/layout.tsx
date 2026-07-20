import type { Metadata } from "next";
import "./accent.css";

export const metadata: Metadata = {
  title: "Accent lab — Admin — Absurdissimo",
};

export default function AccentLabLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
