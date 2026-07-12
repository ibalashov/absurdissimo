import type { Metadata } from "next";
import PackManager from "./PackManager";
import "./starter-packs.css";

export const metadata: Metadata = {
  title: "Starter packs — Admin — Absurdissimo",
};

// Starter pack manager (VocabCards #366). Everything is client-side (the
// admin API authenticates with the localStorage bearer, which never reaches
// the server render); this page just mounts the manager. Access control and
// noindex live in the layout gate (../layout.tsx).

export default function StarterPacksPage() {
  return <PackManager />;
}
