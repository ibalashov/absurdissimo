// Client for the public VocabCards read API (see WEBSITE.md in the
// VocabCards repo). The website talks only to /public/* — no auth.

// Overridable for local development (e.g. pointing at a stub server);
// production builds use the default.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://vocabcards-server.fly.dev";

// ISR window: pages revalidate hourly. New associations appear on the site
// within an hour of being generated in the app.
export const REVALIDATE_SECONDS = 3600;

// Pair slugs look like "it-en". Reject anything else before hitting the API
// (the catch-all /[pair] route also matches /favicon.ico and friends).
export const PAIR_PATTERN = /^[a-z]{2}-[a-z]{2}$/;

// Bare studied-language slugs ("it", ISO 639-1 as in pair slugs) select all
// of that language's pairs combined (VocabCards#328). Together with "all" and
// pair slugs these are the three shapes of the deck's selection slug.
export const LANG_PATTERN = /^[a-z]{2}$/;

// Cards per deck page. The deck browses the full corpus via numbered pages
// (offset paging on GET /public/cards); this is both the SSR preload size and
// the client page size. Must stay <= the server's per-request cap (50).
export const PAGE_SIZE = 48;

// How the deck feed is ordered. "top" ranks by net community vote score
// (newest-first as the tiebreak, server-side via ?sort=top); "recent" is
// plain newest-first. "top" is the default — the feed leads with the cards
// people voted up. The chosen sort maps straight onto /public/cards?sort=.
export type DeckSort = "top" | "recent";
export const DEFAULT_DECK_SORT: DeckSort = "top";

export interface WordInfo {
  part_of_speech?: string | null;
  gender?: string | null;
  transcription?: string | null;
  definition?: string | null;
  emoji?: string | null;
}

export interface Association {
  id: number;
  mnemonic: string;
  explanation: string;
  word_info: WordInfo | null;
  image_id: string | null;
  provenance: string;
  // AbsurdityLevel the card was generated with ("sensible" … "unhinged");
  // null/absent for cards published before the server stored it.
  absurdity?: string | null;
  created_at: string;
}

export interface WordPageData {
  pair: string;
  word: string;
  source_language: string;
  target_language: string;
  associations: Association[];
}

export interface PairIndexWord {
  word: string;
  association_count: number;
  latest_created_at: string;
}

export interface PairIndexData {
  pair: string;
  source_language: string;
  target_language: string;
  words: PairIndexWord[];
}

export interface PairSummary {
  pair: string;
  source_language: string;
  target_language: string;
  word_count: number;
  association_count: number;
}

interface PairsData {
  pairs: PairSummary[];
}

// One card in the cross-pair home feed (GET /public/cards, VocabCards#193).
// `id` is the association id used for card-page links; it is typed optional
// so the feed still renders (linking to the word page instead) if the server
// ships the contract without it.
export interface FeedCard {
  id?: number;
  pair: string;
  source_language: string;
  target_language: string;
  word: string;
  mnemonic: string;
  explanation: string;
  word_info: WordInfo | null;
  image_id: string | null;
  provenance: string;
  // Sound-alike keyword(s) behind the mnemonic, overlaid on grid tiles;
  // null for cards published before the server stored it (VocabCards#261).
  keyword?: string | null;
  // Net community vote score (SUM of ±1 votes), 0 when unvoted. Drives the
  // "top" sort and the vote badge on the tile. Optional so the feed still
  // renders against a server that predates the field (VocabCards#401).
  vote_score?: number;
  created_at: string;
}

interface FeedData {
  cards: FeedCard[];
}

// A word entry flattened across all pair indexes; feeds the toolbar search.
export interface WordIndexEntry {
  word: string;
  pair: string;
  association_count: number;
}

export function imageUrl(imageId: string): string {
  return `${API_BASE}/public/images/${imageId}`;
}

// No AbortSignal on purpose: the Fly.io machine cold-starts in 2-5 s after
// idle, and these fetches run at build/revalidate time where the default
// (generous) timeout is exactly what we want. `tags` label the cached response
// so a hide can revalidate exactly the decks that showed the card (#390).
async function getJson<T>(path: string, tags?: string[]): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: REVALIDATE_SECONDS, ...(tags ? { tags } : {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
  return (await res.json()) as T;
}

// Cache tag for a deck selection's feed (on-demand hide, #390): the cross-pair
// home ("all"), a pair page, or a studied-language page each get their own tag,
// so hiding a card can bust exactly the decks that could show it.
export function deckTag(sel: string): string {
  if (PAIR_PATTERN.test(sel)) return `deck:pair:${sel}`;
  if (LANG_PATTERN.test(sel)) return `deck:lang:${sel}`;
  return "deck:all";
}

// The deck tags a hidden card in `pair` can appear under: the cross-pair home,
// its own pair page, and its source-language page (decks filter by source
// language). Everything else — other pairs, other languages — is left cached.
export function deckTagsForPair(pair: string): string[] {
  const src = pair.split("-")[0];
  return ["deck:all", `deck:pair:${pair}`, `deck:lang:${src}`];
}

export async function getWordPage(
  pair: string,
  word: string,
): Promise<WordPageData | null> {
  return getJson<WordPageData>(
    `/public/pairs/${encodeURIComponent(pair)}/${encodeURIComponent(word)}`,
  );
}

// The home page must render unchanged when the pairs endpoint is missing or
// broken (it ships independently of the server side, see VocabCards#175), so
// unlike the card pages this swallows *all* failures, not just 404.
export async function getPairs(): Promise<PairSummary[]> {
  try {
    const data = await getJson<PairsData>("/public/pairs");
    return data?.pairs ?? [];
  } catch {
    return [];
  }
}

// Live, uncached pair summaries for the browser. The deck's cards are fetched
// live client-side (fetchDeckPage), but its counts come from the hour-cached
// SSR render (loadDeckData), so right after new cards are generated the deck
// shows the old count next to fresh cards. DeckClient calls this on mount to
// bring the counts in step with the cards. `no-store` bypasses ISR/HTTP cache;
// like getPairs it swallows all failures so the SSR counts simply stand.
export async function fetchPairsLive(): Promise<PairSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/public/pairs`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as PairsData;
    return data?.pairs ?? [];
  } catch {
    return [];
  }
}

export async function getPairIndex(
  pair: string,
): Promise<PairIndexData | null> {
  return getJson<PairIndexData>(`/public/pairs/${encodeURIComponent(pair)}`);
}

// Maps a deck selection slug + 1-based page + sort onto the /public/cards
// query for that page: "all" → the cross-pair feed, a pair slug → `pair=`, a
// studied-language slug → `lang=` (VocabCards#314), and `sort=` for the order.
// Shared by the SSR preload (getSelectionCards) and the client pager
// (fetchDeckPage) so the two can never drift apart.
function deckFeedQuery(sel: string, page: number, sort: DeckSort): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((Math.max(1, page) - 1) * PAGE_SIZE),
    sort,
  });
  if (PAIR_PATTERN.test(sel)) params.set("pair", sel);
  else if (LANG_PATTERN.test(sel)) params.set("lang", sel);
  return `/public/cards?${params.toString()}`;
}

// SSR-side page-1 feed for a deck selection slug (see deckFeedQuery for the
// slug→filter mapping). This is the deck's server preload: every deck route —
// "/", "/it-en", "/it" — renders its own selection's cards straight into the
// SSR HTML, so the narrowed routes no longer ship an empty "Loading cards…"
// the browser has to replace after hydrating. ISR-cached hourly, so most
// loads serve those tiles from the edge with no per-user fetch. null means
// the feed endpoint is unavailable — the page degrades to the pair navigator
// (VocabCards#194); swallows *all* failures on purpose, like getPairs.
export async function getSelectionCards(
  sel = "all",
  page = 1,
  sort: DeckSort = DEFAULT_DECK_SORT,
): Promise<FeedCard[] | null> {
  try {
    const data = await getJson<FeedData>(deckFeedQuery(sel, page, sort), [
      deckTag(sel),
    ]);
    return data?.cards ?? null;
  } catch {
    return null;
  }
}

// Server-side sample of one pair's feed, for the community page's related
// strip (emoji + image previews). Garnish only — swallows all failures.
export async function getPairCards(
  pair: string,
  limit = 48,
): Promise<FeedCard[]> {
  try {
    const data = await getJson<FeedData>(
      `/public/cards?pair=${encodeURIComponent(pair)}&limit=${limit}`,
      [`deck:pair:${pair}`],
    );
    return data?.cards ?? [];
  } catch {
    return [];
  }
}

// Client-side fetch of one page of the deck feed (VocabCards#208/#209 + the
// full-deck browse), for the numbered pager. `sel` is the deck's selection
// slug and `page` is 1-based; both are mapped onto the /public/cards query by
// deckFeedQuery. Page 1 of the default sort is the SSR preload
// (getSelectionCards), so this runs for pages 2+ and for page 1 once the
// visitor switches sort. Runs in the browser, so no ISR revalidate hint.
// Unlike getSelectionCards this *throws* on failure: DeckClient catches and
// shows a retry note for the failed page.
export async function fetchDeckPage(
  sel: string,
  page: number,
  sort: DeckSort = DEFAULT_DECK_SORT,
): Promise<FeedCard[]> {
  const path = deckFeedQuery(sel, page, sort);
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
  const data = (await res.json()) as FeedData;
  return data.cards;
}

// Flattens every pair's word index into one list for the toolbar search.
// Individual pair failures are dropped: search degrades, the page survives.
export async function getWordIndexEntries(
  pairs: PairSummary[],
): Promise<WordIndexEntry[]> {
  const indexes = await Promise.all(
    pairs.map((p) => getPairIndex(p.pair).catch(() => null)),
  );
  return indexes.flatMap(
    (index) =>
      index?.words.map((w) => ({
        word: w.word,
        pair: index.pair,
        association_count: w.association_count,
      })) ?? [],
  );
}

// Everything the deck surface needs, loaded once. Shared by the home page
// (`/`, all pairs) and the per-pair route (`/[pair]`, filtered) so the two
// render the identical deck — the pair route is just the home page with a
// pair preselected, not a separate list page. `cards` is page 1 of the
// route's own selection (see getSelectionCards), so every route ships its
// visible feed in the SSR HTML.
export interface DeckData {
  pairs: PairSummary[];
  cards: FeedCard[] | null;
  words: WordIndexEntry[];
  totalCards: number;
  totalWords: number;
}

export async function loadDeckData(sel = "all"): Promise<DeckData> {
  const pairs = await getPairs();
  const [cards, words] = await Promise.all([
    getSelectionCards(sel),
    getWordIndexEntries(pairs),
  ]);
  return {
    pairs,
    cards,
    words,
    totalCards: pairs.reduce((n, p) => n + p.association_count, 0),
    totalWords: pairs.reduce((n, p) => n + p.word_count, 0),
  };
}

export function languageName(apiName: string): string {
  return apiName.charAt(0).toUpperCase() + apiName.slice(1);
}

// Emoji flag per language, keyed by the API's language names. Mirrors the
// iOS app's canonical Language.flag mapping (English is 🇬🇧). Plain Unicode
// emoji on purpose — Windows/Chrome letter-code degradation is accepted, no
// SVG dependency (VocabCards#315).
const LANGUAGE_FLAGS: Record<string, string> = {
  english: "🇬🇧",
  russian: "🇷🇺",
  italian: "🇮🇹",
  german: "🇩🇪",
  french: "🇫🇷",
  spanish: "🇪🇸",
  hebrew: "🇮🇱",
};

export function languageFlag(apiName: string): string | null {
  return LANGUAGE_FLAGS[apiName] ?? null;
}

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

// Full timestamp for tooltips (fixed UTC so SSR and client render the same).
export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(isoDate)) + " UTC";
}

// Coarse relative time for recent moments ("just now" … "6d ago"), falling
// back to the absolute date beyond a week. Coarse on purpose: it renders
// server-side and hydrates later, so finer precision would routinely
// mismatch (callers still suppressHydrationWarning for the minute edges).
export function timeAgo(isoDate: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(isoDate);
}

export function provenanceLabel(provenance: string): string {
  return provenance === "generated" ? "AI-generated" : provenance;
}

// API levels are lowercase enum values ("wild"); display them as a numeric
// level with the app's emoji ramp (AbsurdityLevel order and emoji).
const ABSURDITY_LEVELS: Record<string, { rank: number; emoji: string }> = {
  sensible: { rank: 1, emoji: "🙂" },
  quirky: { rank: 2, emoji: "😏" },
  wild: { rank: 3, emoji: "🤪" },
  bizarre: { rank: 4, emoji: "😵‍💫" },
  unhinged: { rank: 5, emoji: "🤯" },
};

export function absurdityLabel(absurdity: string): string {
  const level = ABSURDITY_LEVELS[absurdity];
  if (!level) return absurdity;
  return `${level.rank} of 5 ${level.emoji}`;
}

// BCP-47 tag for browser speech synthesis, keyed by the API's language
// names. Mirrors the app's Language.speechLanguageCode so both surfaces
// pick equivalent voices.
const SPEECH_LANGUAGE_CODES: Record<string, string> = {
  english: "en-US",
  russian: "ru-RU",
  italian: "it-IT",
  german: "de-DE",
  french: "fr-FR",
  spanish: "es-ES",
  hebrew: "he-IL",
};

export function speechLanguageCode(apiName: string): string | null {
  return SPEECH_LANGUAGE_CODES[apiName] ?? null;
}
