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
