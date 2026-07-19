import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DeckShell from "@/components/DeckShell";
import {
  isSupportedSel,
  LANG_PATTERN,
  languageName,
  languageNameForCode,
  loadDeckData,
  PAIR_PATTERN,
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

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { pair: sel } = await params;
  // noindex by default: indexing is quality-gated and flips per page in
  // phase 2 (see WEBSITE.md, SEO strategy).
  const noindex: Metadata = { robots: { index: false, follow: true } };
  // Language names derive from the slug's own codes (via SUPPORTED_PAIRS /
  // languageNameForCode in lib/api.ts), not the corpus-derived pair data —
  // an empty corpus must not strip titles from supported pairs
  // (VocabCards#545).
  if (!isSupportedSel(sel)) return noindex;

  if (LANG_PATTERN.test(sel)) {
    const source = languageName(languageNameForCode(sel));
    return {
      title: `${source} mnemonics | Absurdissimo`,
      description: `Browse ${source} words with absurd, memorable mnemonic association cards.`,
      ...noindex,
    };
  }
  const [srcCode, tgtCode] = sel.split("-");
  const source = languageName(languageNameForCode(srcCode));
  const target = languageName(languageNameForCode(tgtCode));
  return {
    title: `${source} to ${target} mnemonics | Absurdissimo`,
    description: `Browse ${source} words with absurd, memorable mnemonic association cards for ${target} speakers.`,
    ...noindex,
  };
}

export default async function NarrowedDeckPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ all?: string }>;
}) {
  const { pair: sel } = await params;
  // Slugs are validated against the site-local SUPPORTED_PAIRS/SUPPORTED_LANGS
  // constants, never the corpus-derived pair data: a supported pair with zero
  // published cards renders the deck's empty state, so a wholesale card
  // retire can't 404 the pair pages — nor "/", which middleware rewrites to
  // the visitor's saved `pair` cookie selection (VocabCards#545). Unknown
  // slugs (including non-slug paths this catch-all swallows, like
  // /favicon.ico) still 404.
  if (!isSupportedSel(sel)) notFound();
  // `?all=1` on a pair route records the filter context the pair was picked
  // from: the sidebar's flag filter is a separate axis from the pair
  // selection, and picking a pair must not move it. Plain /fr-ru = picked
  // from the French view (list narrowed, 🇫🇷 outlined); /fr-ru?all=1 = picked
  // from the All view (every group listed, "All" outlined). In the URL so the
  // SSR HTML already carries the right chip state (no hydration jump), and
  // cookie-independent so prefetching stays safe. Meaningless on a language
  // route (its chip IS the filter) — ignored there.
  const allView = PAIR_PATTERN.test(sel) && (await searchParams).all === "1";
  const data = await loadDeckData(sel);

  return <DeckShell data={data} initialSel={sel} allView={allView} />;
}
