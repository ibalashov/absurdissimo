// Client for the admin API (VocabCards #364/#365/#366). Everything here is
// admin-session gated server-side: calls carry the community bearer token from
// localStorage (lib/auth.ts getToken) as an Authorization header — the same
// channel as community writes, NOT the vc_admin_token cookie, which exists
// solely for the /admin server layout's gate. Client-only, like community.ts.

import { API_BASE, type WordInfo } from "./api";
import { clearAuth, getToken } from "./auth";

export type ImageStatus = "ready" | "pending" | "none";

// One association as the admin endpoints return it. The three sources vary
// slightly in shape (pack cards carry `position`, browse rows carry
// `in_starter_pack`, generate/detail carry `image_status`), so the extras are
// optional on one shared type.
export interface AdminCard {
  association_id: number;
  word: string;
  display_word?: string;
  mnemonic: string;
  explanation: string;
  keyword?: string | null;
  word_info?: WordInfo | null;
  image_id?: string | null;
  image_url?: string | null;
  absurdity?: string | null;
  position?: number;
  in_starter_pack?: boolean;
  image_status?: ImageStatus;
}

export interface StarterPack {
  pair: string;
  cards: AdminCard[];
}

export interface AdminCardsPage {
  pair: string;
  page: number;
  page_size: number;
  total: number;
  cards: AdminCard[];
}

// Admin image_url values are relative paths — absolutize against the server.
export function adminImageUrl(imageUrl: string): string {
  return imageUrl.startsWith("http") ? imageUrl : `${API_BASE}${imageUrl}`;
}

// Carries the HTTP status so callers can branch on the API's meaningful
// conflicts (409 already-member / stale order, 404 unknown word or member).
export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isAdminStatus(err: unknown, status: number): boolean {
  return err instanceof AdminApiError && err.status === status;
}

async function adminFetch<T>(
  path: string,
  init?: { method?: string; json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
  if (res.status === 401) {
    // Expired/revoked session: drop it (mirrors community.ts) so the nav
    // falls back to signed-out and re-offers sign-in.
    clearAuth();
    throw new AdminApiError(401, "Your session expired — sign in again.");
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail;
    throw new AdminApiError(
      res.status,
      typeof detail === "string"
        ? detail
        : `Admin API ${path} responded ${res.status}`,
    );
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Whether the current session is an allowlisted admin (GET /admin/me → 200).
// Memoized per token, so the nav probe costs at most one request per session;
// anonymous visitors never hit the network. A non-admin's 403 resolves false
// without touching the stored session (the gate is a uniform 403, never 401).
let adminProbe: { token: string; result: Promise<boolean> } | null = null;

export function checkIsAdmin(): Promise<boolean> {
  const token = getToken();
  if (!token) return Promise.resolve(false);
  if (adminProbe?.token !== token) {
    adminProbe = {
      token,
      result: adminFetch<{ email: string }>("/admin/me").then(
        () => true,
        () => false,
      ),
    };
  }
  return adminProbe.result;
}

export function fetchStarterPack(pair: string): Promise<StarterPack> {
  return adminFetch<StarterPack>(
    `/admin/starter-pack/${encodeURIComponent(pair)}`,
  );
}

// 201 on success; 404 = id not in this pair; 409 = already a member.
export async function addToStarterPack(
  pair: string,
  associationId: number,
): Promise<void> {
  await adminFetch<unknown>(`/admin/starter-pack/${encodeURIComponent(pair)}`, {
    method: "POST",
    json: { association_id: associationId },
  });
}

// 404 = not a member (already gone).
export async function removeFromStarterPack(
  pair: string,
  associationId: number,
): Promise<void> {
  await adminFetch<unknown>(
    `/admin/starter-pack/${encodeURIComponent(pair)}/${associationId}`,
    { method: "DELETE" },
  );
}

// Full-list PUT; 409 unless the ids are exactly the current membership
// (stale view — refetch the pack and tell the admin).
export async function reorderStarterPack(
  pair: string,
  associationIds: number[],
): Promise<void> {
  await adminFetch<unknown>(
    `/admin/starter-pack/${encodeURIComponent(pair)}/order`,
    { method: "PUT", json: { association_ids: associationIds } },
  );
}

// Empty q lists the whole corpus for the pair, paged (page_size 50).
export function searchAdminCards(
  pair: string,
  q: string,
  page: number,
): Promise<AdminCardsPage> {
  const params = new URLSearchParams({ pair, page: String(page) });
  if (q) params.set("q", q);
  return adminFetch<AdminCardsPage>(`/admin/cards?${params.toString()}`);
}

// absurdity_level defaults to 'quirky' server-side; avoid_association_id is
// the re-roll mechanism (regenerate steering away from the shown card).
// 404 = word not in the pair's vocabulary; 422 = invalid word.
export function generateAdminCard(
  word: string,
  pair: string,
  avoidAssociationId?: number,
  absurdityLevel?: string,
): Promise<AdminCard> {
  return adminFetch<AdminCard>(`/admin/cards/generate`, {
    method: "POST",
    json: {
      word,
      pair,
      ...(avoidAssociationId !== undefined
        ? { avoid_association_id: avoidAssociationId }
        : {}),
      ...(absurdityLevel ? { absurdity_level: absurdityLevel } : {}),
    },
  });
}

// What the hide cascade cleared. The card is soft-retired (append-only corpus,
// fully reversible server-side — nothing is destroyed), unpinned from the
// starter pack, and its community entry hidden.
export interface HiddenCard {
  association_id: number;
  hidden: boolean;
  unpinned_from_starter_pack: boolean;
  community_entry_hidden: boolean;
}

// Hide an inappropriate/broken card (VocabCards #390): a reversible suspension —
// soft-retire the corpus row and cascade (starter pack + community), keeping the
// record. 404 = unknown id; idempotent for an already-hidden card.
export function hideAdminCard(associationId: number): Promise<HiddenCard> {
  return adminFetch<HiddenCard>(`/admin/cards/${associationId}/hide`, {
    method: "POST",
  });
}

export interface StarterBatch {
  pair: string;
  scene: string;
  words: string[];
}

// Themed batch to seed an empty pack (#366): the server invents one coherent,
// positive scene and returns up to `count` medium-hard, verb-leaning source
// words that populate it (deduped, real dictionary lemmas). The caller then
// generates a card per word via generateAdminCard.
export function suggestStarterBatch(
  pair: string,
  count: number,
): Promise<StarterBatch> {
  return adminFetch<StarterBatch>(
    `/admin/starter-pack/${encodeURIComponent(pair)}/suggest`,
    { method: "POST", json: { count } },
  );
}

// Card detail with image_status — polled (~3 s) after generation until the
// illustration is 'ready' ('none' means stop, there won't be one).
export function fetchAdminCard(associationId: number): Promise<AdminCard> {
  return adminFetch<AdminCard>(`/admin/cards/${associationId}`);
}
