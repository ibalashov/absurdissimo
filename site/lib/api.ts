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

// Cards per deck page. The deck browses the full corpus via numbered pages
// (offset paging on GET /public/cards); this is both the SSR preload size and
// the client page size. Must stay <= the server's per-request cap (50).
export const PAGE_SIZE = 48;

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
// (generous) timeout is exactly what we want.
async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} responded ${res.status}`);
  return (await res.json()) as T;
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

// null means "feed unavailable" (endpoint not deployed yet, or erroring) —
// the home page then degrades to the pair navigator (VocabCards#194). This
// swallows *all* failures on purpose: the page must not break without #193.
export async function getFeedCards(limit = PAGE_SIZE): Promise<FeedCard[] | null> {
  try {
    const data = await getJson<FeedData>(`/public/cards?limit=${limit}`);
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
    );
    return data?.cards ?? [];
  } catch {
    return [];
  }
}

// Client-side fetch of one page of the deck feed (VocabCards#208/#209 + the
// full-deck browse). `pair` null is the cross-pair feed; a slug filters to one
// pair; `lang` (ISO 639-1 source-language code, VocabCards#314) filters to all
// of that language's pairs combined — pass at most one of the two. `page` is
// 1-based and paginates the *whole* corpus via offset — the preloaded feed is
// only page 1, so later pages must come from the API. Runs in the browser, so
// no ISR revalidate hint. Unlike getFeedCards this *throws* on failure:
// DeckClient catches and, for page 1, falls back to client-side filtering of
// the preloaded deck (which also covers #314 not being deployed yet).
export async function fetchDeckPage(
  pair: string | null,
  page: number,
  lang?: string | null,
): Promise<FeedCard[]> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String((Math.max(1, page) - 1) * PAGE_SIZE),
  });
  if (pair) params.set("pair", pair);
  else if (lang) params.set("lang", lang);
  const path = `/public/cards?${params.toString()}`;
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
// pair preselected, not a separate list page.
export interface DeckData {
  pairs: PairSummary[];
  cards: FeedCard[] | null;
  words: WordIndexEntry[];
  totalCards: number;
  totalWords: number;
}

export async function loadDeckData(): Promise<DeckData> {
  const pairs = await getPairs();
  const [cards, words] = await Promise.all([
    getFeedCards(),
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
