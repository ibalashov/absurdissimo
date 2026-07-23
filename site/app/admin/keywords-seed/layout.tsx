import type { Metadata } from "next";
import "../starter-packs/starter-packs.css";
import "./keywords-seed.css";

export const metadata: Metadata = {
  title: "Keywords seed — Admin — Absurdissimo",
};

export default function KeywordsSeedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="keywords-seed-page">{children}</div>;
}
