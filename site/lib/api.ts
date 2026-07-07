// Client for the public VocabCards read API (see WEBSITE.md in the
// VocabCards repo). The website talks only to /public/* — no auth.

// Overridable for local development (e.g. pointing at a stub server);
// production builds use the default.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://vocabcards-server.fly.dev";

// ISR window: pages revalidate hourly. New associations appear on the site
// within an hour of being generated in the app.
export const REVALIDATE_SECONDS = 3600;

// Pair slugs look like "it-en". Reject anything else before hitting the API
// (the catch-all /[pair] route also matches /favicon.ico and friends).
export const PAIR_PATTERN = /^[a-z]{2}-[a-z]{2}$/;

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

export async function getPairIndex(
  pair: string,
): Promise<PairIndexData | null> {
  return getJson<PairIndexData>(`/public/pairs/${encodeURIComponent(pair)}`);
}

// null means "feed unavailable" (endpoint not deployed yet, or erroring) —
// the home page then degrades to the pair navigator (VocabCards#194). This
// swallows *all* failures on purpose: the page must not break without #193.
export async function getFeedCards(limit = 48): Promise<FeedCard[] | null> {
  try {
    const data = await getJson<FeedData>(`/public/cards?limit=${limit}`);
    return data?.cards ?? null;
  } catch {
    return null;
  }
}

// Client-side fetch of one pair's newest cards (VocabCards#208/#209). Runs
// in the browser when a sidebar pair is selected, so no ISR revalidate hint.
// Unlike getFeedCards this *throws* on failure: DeckClient catches and falls
// back to client-side filtering of the preloaded deck.
export async function fetchPairCards(
  pair: string,
  limit = 48,
): Promise<FeedCard[]> {
  const path = `/public/cards?pair=${encodeURIComponent(pair)}&limit=${limit}`;
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

export function languageName(apiName: string): string {
  return apiName.charAt(0).toUpperCase() + apiName.slice(1);
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
