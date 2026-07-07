import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeckShell from "@/components/DeckShell";
import {
  getPairs,
  languageName,
  loadDeckData,
  PAIR_PATTERN,
} from "@/lib/api";
import "../deck.css";

// The per-pair route renders the home deck filtered to one language pair, so a
// breadcrumb like /it-ru lands on the full deck (search, feed, sidebar) with
// that pair preselected — not a separate, thinner word list. Selecting a pair
// in the sidebar navigates here, which keeps the filter in the URL so the back
// button restores it after opening a card.

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

type Params = Promise<{ pair: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { pair } = await params;
  const noindex: Metadata = { robots: { index: false, follow: true } };
  if (!PAIR_PATTERN.test(pair)) return noindex;
  const match = (await getPairs()).find((p) => p.pair === pair);
  if (!match) return noindex;

  const source = languageName(match.source_language);
  const target = languageName(match.target_language);
  return {
    title: `${source} to ${target} mnemonics | Absurdissimo`,
    description: `Browse ${source} words with absurd, memorable mnemonic association cards for ${target} speakers.`,
    // noindex by default: indexing is quality-gated and flips per page in
    // phase 2 (see WEBSITE.md, SEO strategy).
    ...noindex,
  };
}

export default async function PairDeckPage({ params }: { params: Params }) {
  const { pair } = await params;
  if (!PAIR_PATTERN.test(pair)) notFound();
  const data = await loadDeckData();
  if (!data.pairs.some((p) => p.pair === pair)) notFound();

  return <DeckShell data={data} initialPair={pair} />;
}
