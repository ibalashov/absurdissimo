import type { Metadata } from "next";
import "./two-step.css";

export const metadata: Metadata = {
  title: "Two-step lab — Admin — Absurdissimo",
};

export default function TwoStepLabLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
