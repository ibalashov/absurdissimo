import type { Metadata } from "next";
import DeckShell from "@/components/DeckShell";
import { loadDeckData } from "@/lib/api";
import "./deck.css";

// The home page is the product surface: a cross-pair deck of recent mnemonic
// cards (ranked-deck layout, design B — VocabCards#194). The marketing page
// lives at /app. This stays the site's one indexable page. The per-pair route
// /[pair] renders the same deck filtered to that pair.

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Absurdissimo — Vocabulary that actually sticks",
  description:
    "A live deck of vivid, absurd mnemonic cards made by people learning vocabulary with the Absurdissimo iOS app. Browse by language pair, or make your own.",
};

export default async function Home() {
  const data = await loadDeckData();
  return <DeckShell data={data} initialPair="all" />;
}
