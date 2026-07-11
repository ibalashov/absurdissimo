import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeckShell from "@/components/DeckShell";
import {
  getPairs,
  LANG_PATTERN,
  languageName,
  loadDeckData,
  PAIR_PATTERN,
  PairSummary,
} from "@/lib/api";
import "../deck.css";

// The narrowed deck routes: this catch-all accepts both non-"all" shapes of
// the deck's selection slug — a pair ("/it-ru") or a bare studied-language
// code ("/it", all of that language's pairs combined, VocabCards#328) — and
// renders the home deck with that selection preselected: same search, feed
// and sidebar, not a separate, thinner list page. Selecting anything in the
// sidebar navigates here, which keeps the filter in the URL so the back
// button restores it after opening a card. ISR like the home page; unknown
// slugs 404.

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

type Params = Promise<{ pair: string }>;

// Does the corpus contain this selection? A language slug exists when any
// pair studies it; a pair slug when the pair itself is listed.
function selExists(pairs: PairSummary[], sel: string): boolean {
  return pairs.some((p) =>
    LANG_PATTERN.test(sel) ? p.pair.startsWith(`${sel}-`) : p.pair === sel,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { pair: sel } = await params;
  // noindex by default: indexing is quality-gated and flips per page in
  // phase 2 (see WEBSITE.md, SEO strategy).
  const noindex: Metadata = { robots: { index: false, follow: true } };
  if (!PAIR_PATTERN.test(sel) && !LANG_PATTERN.test(sel)) return noindex;
  const match = (await getPairs()).find((p) =>
    LANG_PATTERN.test(sel) ? p.pair.startsWith(`${sel}-`) : p.pair === sel,
  );
  if (!match) return noindex;

  const source = languageName(match.source_language);
  if (LANG_PATTERN.test(sel)) {
    return {
      title: `${source} mnemonics | Absurdissimo`,
      description: `Browse ${source} words with absurd, memorable mnemonic association cards.`,
      ...noindex,
    };
  }
  const target = languageName(match.target_language);
  return {
    title: `${source} to ${target} mnemonics | Absurdissimo`,
    description: `Browse ${source} words with absurd, memorable mnemonic association cards for ${target} speakers.`,
    ...noindex,
  };
}

export default async function NarrowedDeckPage({
  params,
}: {
  params: Params;
}) {
  const { pair: sel } = await params;
  if (!PAIR_PATTERN.test(sel) && !LANG_PATTERN.test(sel)) notFound();
  const data = await loadDeckData();
  if (!selExists(data.pairs, sel)) notFound();

  return <DeckShell data={data} initialSel={sel} />;
}
