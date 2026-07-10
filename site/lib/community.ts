// Client for the VocabCards community API (/community/*, VocabCards #274).
// Unlike /public/* this surface takes writes and is keyed by an anonymous
// device id (a client-chosen UUID sent as X-Device-Id — a bucket key, not a
// credential). CORS on the server allows this origin + localhost.

import { API_BASE } from "./api";

export interface CommunityComment {
  id: number;
  entry_id: number;
  body: string;
  author_handle: string;
  created_at: string;
}

export interface CommunityEntry {
  id: number;
  kind: "ai" | "user";
  keyword: string | null;
  mnemonic: string;
  explanation: string;
  image_id: string | null;
  absurdity: string | null;
  author_handle: string | null; // null for AI entries
  score: number;
  your_vote: number; // -1 | 0 | 1
  is_pick: boolean;
  created_at: string;
  comments: CommunityComment[];
}

export interface CommunityThread {
  pair: string;
  word: string;
  display_word: string;
  source_language: string;
  target_language: string;
  entries: CommunityEntry[];
}

// Fixed device id used only for server-side first-paint reads: the SSR render
// can't see the visitor's localStorage, so it fetches thread content (scores,
// comments) under a neutral id whose your_vote is always 0. The client then
// re-fetches with the real per-visitor id to light up their own votes.
const SSR_DEVICE_ID = "00000000-0000-0000-0000-000000000000";

const DEVICE_ID_KEY = "vc_device_id";

// Stable per-browser anonymous id, created lazily on first write/interaction.
// Client-only (localStorage); callers must not invoke this during SSR.
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function headers(deviceId: string): HeadersInit {
  return { "X-Device-Id": deviceId, "Content-Type": "application/json" };
}

// Server-side first-paint read. Returns null on any non-2xx (unknown pair/word,
// or the API being unreachable) so the route can 404 or degrade gracefully.
export async function fetchThreadServer(
  pair: string,
  word: string,
): Promise<CommunityThread | null> {
  try {
    const res = await fetch(
      `${API_BASE}/community/${encodeURIComponent(pair)}/${encodeURIComponent(word)}`,
      { headers: headers(SSR_DEVICE_ID), cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as CommunityThread;
  } catch {
    return null;
  }
}

// Client read: same thread, but under the visitor's real device id so
// `your_vote` reflects their votes. Throws on failure (the caller keeps the
// SSR data it already has).
export async function fetchThread(
  pair: string,
  word: string,
): Promise<CommunityThread> {
  const res = await fetch(
    `${API_BASE}/community/${encodeURIComponent(pair)}/${encodeURIComponent(word)}`,
    { headers: headers(getDeviceId()), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`community thread ${res.status}`);
  return (await res.json()) as CommunityThread;
}

export interface VoteResult {
  entry_id: number;
  score: number;
  your_vote: number;
}

// value: 1 upvote, -1 downvote, 0 clears.
export async function castVote(
  entryId: number,
  value: number,
): Promise<VoteResult> {
  const res = await fetch(`${API_BASE}/community/entries/${entryId}/vote`, {
    method: "POST",
    headers: headers(getDeviceId()),
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(`vote ${res.status}`);
  return (await res.json()) as VoteResult;
}

export async function submitEntry(
  pair: string,
  word: string,
  body: { keyword?: string; mnemonic: string; explanation?: string },
): Promise<CommunityEntry> {
  const res = await fetch(
    `${API_BASE}/community/${encodeURIComponent(pair)}/${encodeURIComponent(word)}/entries`,
    { method: "POST", headers: headers(getDeviceId()), body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `submit ${res.status}`);
  }
  return (await res.json()) as CommunityEntry;
}

export async function addComment(
  entryId: number,
  commentBody: string,
): Promise<CommunityComment> {
  const res = await fetch(`${API_BASE}/community/entries/${entryId}/comments`, {
    method: "POST",
    headers: headers(getDeviceId()),
    body: JSON.stringify({ body: commentBody }),
  });
  if (!res.ok) throw new Error(`comment ${res.status}`);
  return (await res.json()) as CommunityComment;
}

// "Top" = highest score, oldest as tie-break (mirrors the server's ranking so
// the pick stays first). "Newest" = most recent first.
export function sortEntries(
  entries: CommunityEntry[],
  mode: "top" | "newest",
): CommunityEntry[] {
  const copy = [...entries];
  if (mode === "newest") {
    copy.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  } else {
    copy.sort(
      (a, b) =>
        b.score - a.score ||
        a.created_at.localeCompare(b.created_at) ||
        a.id - b.id,
    );
  }
  return copy;
}
