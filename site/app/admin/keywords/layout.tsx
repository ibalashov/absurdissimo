import type { Metadata } from "next";
import "../starter-packs/starter-packs.css";
import "../labs/labs.css";
import "../cards/cards.css";
import "./keywords.css";

export const metadata: Metadata = { title: "Keywords — Admin — Absurdissimo" };

export default function KeywordsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="keywords-page">{children}</div>;
}
