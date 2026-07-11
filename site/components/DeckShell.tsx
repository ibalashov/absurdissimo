import Link from "next/link";
import DeckClient from "@/components/DeckClient";
import { DeckData } from "@/lib/api";

// The full deck surface shared by the deck routes. `initialSel` is the
// route's selection slug — "all" on `/`, a studied-language code on `/it`, a
// pair slug on `/it-en` — so every URL renders the same deck with its
// selection preselected.
export default function DeckShell({
  data,
  initialSel,
}: {
  data: DeckData;
  initialSel: string;
}) {
  return (
    <>
      <DeckClient
        pairs={data.pairs}
        cards={data.cards}
        words={data.words}
        totalCards={data.totalCards}
        totalWords={data.totalWords}
        initialSel={initialSel}
      />
      <footer className="deck-footer">
        <p>Absurdissimo &copy; 2026 Ivan Balashov</p>
        <div className="footer-links">
          <Link href="/feedback">Feedback</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </footer>
    </>
  );
}
