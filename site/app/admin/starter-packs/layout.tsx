import type { Metadata } from "next";
import { StarterPackProvider } from "./StarterPackContext";
import "./starter-packs.css";

export const metadata: Metadata = {
  title: "Starter packs — Admin — Absurdissimo",
};

// Starter pack manager (VocabCards #366), split into sub-pages: current pack,
// browse & select, and generate. The shared provider (pair switcher + loaded
// pack) lives here in the section layout so the App Router keeps it mounted as
// you move between the sub-pages — only the {children} slot swaps. Access
// control and noindex live in the /admin layout gate (../layout.tsx).

export default function StarterPacksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StarterPackProvider>{children}</StarterPackProvider>;
}
