import type { Metadata } from "next";
import Link from "next/link";
import DeckClient from "@/components/DeckClient";
import { getFeedCards, getPairs, getWordIndexEntries } from "@/lib/api";
import "./deck.css";

// The home page is the product surface: a cross-pair deck of recent mnemonic
// cards (ranked-deck layout, design B — VocabCards#194). The marketing page
// lives at /app. This stays the site's one indexable page.

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Absurdissimo — Vocabulary that actually sticks",
  description:
    "A live deck of vivid, absurd mnemonic cards made by people learning vocabulary with the Absurdissimo iOS app. Browse by language pair, or make your own.",
};

export default async function Home() {
  const pairs = await getPairs();
  const [cards, words] = await Promise.all([
    getFeedCards(),
    getWordIndexEntries(pairs),
  ]);
  const totalCards = pairs.reduce((n, p) => n + p.association_count, 0);
  const totalWords = pairs.reduce((n, p) => n + p.word_count, 0);

  return (
    <>
      <DeckClient
        pairs={pairs}
        cards={cards}
        words={words}
        totalCards={totalCards}
        totalWords={totalWords}
      />
      <footer className="deck-footer">
        <p>Absurdissimo &copy; 2026 Ivan Balashov</p>
        <div className="footer-links">
          <a href="mailto:ibalashov@gmail.com">Support</a>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </footer>
    </>
  );
}
