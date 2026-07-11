import Link from "next/link";
import DeckClient from "@/components/DeckClient";
import { DeckData } from "@/lib/api";

// The full deck surface shared by the deck routes. `initialSel` is the
// route's selection slug — "all" on `/`, a studied-language code on `/it`, a
// pair slug on `/it-en` — so every URL renders the same deck with its
// selection preselected. `allView` marks a pair route reached from the All
// view (`?all=1`): the flag filter stays on "All" (see [pair]/page.tsx).
export default function DeckShell({
  data,
  initialSel,
  allView = false,
}: {
  data: DeckData;
  initialSel: string;
  allView?: boolean;
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
        allView={allView}
      />
      <footer className="deck-footer">
        <Link className="footer-cta" href="/app">
          Get the app
        </Link>
        <p>Absurdissimo &copy; 2026</p>
        <div className="footer-links">
          <Link href="/feedback">Feedback</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </footer>
    </>
  );
}
