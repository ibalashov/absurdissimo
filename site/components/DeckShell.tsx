import Link from "next/link";
import DeckClient from "@/components/DeckClient";
import { DeckData } from "@/lib/api";

// The full deck surface shared by the home page and the per-pair route.
// `initialPair` is "all" on `/` and the pair slug on `/[pair]`, selecting the
// sidebar filter so both URLs render the same deck.
export default function DeckShell({
  data,
  initialPair,
}: {
  data: DeckData;
  initialPair: string;
}) {
  return (
    <>
      <DeckClient
        pairs={data.pairs}
        cards={data.cards}
        words={data.words}
        totalCards={data.totalCards}
        totalWords={data.totalWords}
        initialPair={initialPair}
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
