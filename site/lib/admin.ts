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
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail.message === "string"
          ? detail.message
          : `Admin API ${path} responded ${res.status}`;
    throw new AdminApiError(
      res.status,
      message,
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
// record. 404 = unknown id; idempotent for an already-hidden card. `pair` is the
// card's pair, used only to revalidate the decks that showed it.
export async function hideAdminCard(
  associationId: number,
  pair: string,
): Promise<HiddenCard> {
  const result = await adminFetch<HiddenCard>(
    `/admin/cards/${associationId}/hide`,
    { method: "POST" },
  );
  // The hide already succeeded server-side; now bust the ISR-cached decks that
  // showed this pair so the card vanishes from the site within seconds instead
  // of the ~1h window. Best-effort — a failed revalidation just falls back to
  // the timer, so never let it surface as a hide failure.
  await requestDeckRevalidate(pair).catch(() => {});
  return result;
}

// Ping the same-origin site route that revalidates the home/pair/lang decks for
// `pair` (VocabCards #390). Carries the admin token so the route can confirm the
// caller is an admin before spending regeneration. Not via adminFetch: this is a
// site route, not the API server.
async function requestDeckRevalidate(pair: string): Promise<void> {
  const token = getToken();
  if (!token) return;
  await fetch(`/api/revalidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pair }),
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

// Association-quality lab (#426). These calls deliberately share adminFetch
// with starter packs: both use the community bearer token client-side while
// the parent /admin layout enforces the allowlist server-side.
export interface LabConfig {
  key: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
  prompt_ref: string;
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  unit_price_usd: number;
}

export interface LabGeneration {
  id: number;
  word: string;
  config_key: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
  prompt_ref: string;
  keyword?: string | null;
  mnemonic?: string | null;
  explanation?: string | null;
  strategy?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  latency_ms?: number | null;
  error?: string | null;
  raw_response?: string | null;
  judge_scores?: Record<string, number | string> | string | null;
  judge_total?: number | null;
  judge_model?: string | null;
}

export interface LabPick {
  word: string;
  generation_id: number;
}

export interface LabRun {
  id: number;
  source_language: string;
  target_language: string;
  absurdity: string;
  status: "running" | "done" | "error";
  created_at: string;
  words: string[];
  configs: LabConfig[];
  projected_cost_usd: number;
  actual_cost_usd?: number | null;
  generations?: LabGeneration[];
  picks?: LabPick[];
}

export interface LabRunPage {
  page: number;
  page_size: number;
  total: number;
  runs: LabRun[];
}

export interface LabSample {
  pair: string;
  words: string[];
  bands: string[];
}

export function fetchLabConfigs(): Promise<{ configs: LabConfig[] }> {
  return adminFetch("/admin/labs/configs");
}

export function startLabRun(body: {
  pair: string;
  absurdity: string;
  words: string[];
  config_keys: string[];
}): Promise<{ run_id: number; projected_cost_usd: number }> {
  return adminFetch("/admin/labs/runs", { method: "POST", json: body });
}

export function fetchLabRun(id: number): Promise<LabRun> {
  return adminFetch(`/admin/labs/runs/${id}`);
}

// Omitting `pair` lists runs across all pairs (the history filter is optional).
export function fetchLabRuns(pair?: string, page = 1): Promise<LabRunPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (pair) params.set("pair", pair);
  return adminFetch(`/admin/labs/runs?${params.toString()}`);
}

export function sampleLabWords(
  pair: string,
  n: number,
  bands: string[],
): Promise<LabSample> {
  const params = new URLSearchParams({
    pair,
    n: String(n),
    bands: bands.join(","),
  });
  return adminFetch(`/admin/labs/sample?${params.toString()}`);
}

export async function pickLabGeneration(
  runId: number,
  word: string,
  generationId: number,
): Promise<void> {
  await adminFetch(`/admin/labs/runs/${runId}/picks`, {
    method: "PUT",
    json: { word, generation_id: generationId },
  });
}

// Card detail with image_status — polled (~3 s) after generation until the
// illustration is 'ready' ('none' means stop, there won't be one).
export function fetchAdminCard(associationId: number): Promise<AdminCard> {
  return adminFetch<AdminCard>(`/admin/cards/${associationId}`);
}
