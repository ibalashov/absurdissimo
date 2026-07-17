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

// Saved prompt template (#427). Append-only server-side: saving always creates
// a new row, so a run's stored "lab:<id>" ref forever resolves to exactly the
// text that generated its cards.
export interface LabPrompt {
  id: number;
  name: string;
  body: string;
  created_at: string;
}

// The production prompt, exposed so the UI can seed new templates from it.
export interface LabProdPrompt {
  ref: string;
  body: string;
  prompt_version: number;
}

export interface LabPromptsResponse {
  prompts: LabPrompt[];
  prod: LabProdPrompt;
}

export function fetchLabPrompts(): Promise<LabPromptsResponse> {
  return adminFetch("/admin/labs/prompts");
}

// 422 (malformed braces / unknown placeholders) surfaces the server's string
// detail via AdminApiError.message — callers show it verbatim.
export function createLabPrompt(
  name: string,
  body: string,
): Promise<LabPrompt> {
  return adminFetch("/admin/labs/prompts", {
    method: "POST",
    json: { name, body },
  });
}

// One run entry: a config key plus the prompt it runs with ("prod:v4" or
// "lab:<id>"). The same key may appear repeatedly with different prompt_refs —
// that's the prompt-variant axis (#427).
export interface LabRunConfigEntry {
  key: string;
  prompt_ref: string;
}

export function fetchLabConfigs(): Promise<{ configs: LabConfig[] }> {
  return adminFetch("/admin/labs/configs");
}

export function startLabRun(body: {
  pair: string;
  absurdity: string;
  words: string[];
  configs: LabRunConfigEntry[];
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

// Runtime settings (VocabCards #433): admin-editable generation params (model,
// system prompt, prompt version, default absurdity) that were compile-time
// constants server-side. GET returns effective + default values, which fields
// are overridden, and the option lists for the dropdowns; PUT is a partial
// update — an omitted field is left as-is, and a field set back to its default
// clears the override.
export interface RuntimeSettings {
  model: string;
  system_prompt: string;
  prompt_version: number;
  default_absurdity_level: string;
  // Model tunables (VocabCards #460/#461). null = unset: the model keeps its
  // own default. Unlike the four fields above, whose default is a concrete
  // value, these are cleared by PUTting an explicit null — omitting the field
  // leaves it untouched.
  reasoning_effort: string | null;
  temperature: number | null;
}

export type RuntimeSettingField = keyof RuntimeSettings;

export interface RuntimeSettingsResponse {
  effective: RuntimeSettings;
  defaults: RuntimeSettings;
  overridden: RuntimeSettingField[];
  model_options: string[];
  absurdity_options: string[];
  reasoning_effort_options: string[];
  // Model id → tunable params it supports ("reasoning_effort"/"temperature").
  // A tunable the selected model doesn't support is stored but inert — the UI
  // greys it out instead of hiding or clearing it.
  model_tunables: Record<string, string[]>;
}

export function fetchRuntimeSettings(): Promise<RuntimeSettingsResponse> {
  return adminFetch<RuntimeSettingsResponse>("/admin/settings");
}

// Only the fields present in `update` are changed. Server validates the model
// against model_options, the prompt template's placeholders, reasoning_effort
// against reasoning_effort_options, and temperature within [0, 2] — its 422
// detail surfaces through AdminApiError. reasoning_effort/temperature take an
// explicit null to clear (their default is unset).
export function updateRuntimeSettings(
  update: Partial<RuntimeSettings>,
): Promise<RuntimeSettingsResponse> {
  return adminFetch<RuntimeSettingsResponse>("/admin/settings", {
    method: "PUT",
    json: update,
  });
}

// Cards inventory (VocabCards #457/#458): every generation ever stored —
// hidden rows included — with the generation_details telemetry joined in.
// One row per generation (a card variant), NOT one per active word.

export interface InventoryRow {
  id: number;
  source_language: string;
  target_language: string;
  word: string;
  display_word: string;
  mnemonic: string;
  explanation: string;
  keyword: string | null;
  strategy: string | null;
  absurdity: string | null;
  prompt_version: string | null;
  model: string | null;
  provenance: string;
  audience: string | null;
  device_id: string | null;
  parent_generation_id: number | null;
  image_id: string | null;
  retired_at: string | null;
  created_at: string;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  // Stamped at generation time, or derived server-side from the model name
  // for rows that predate the stamp.
  provider: string | null;
  effort: string | null;
  // Image-render telemetry from the image_details sidecar (VocabCards #464).
  // Provider derives to 'openai' server-side for legacy rows with an image;
  // legacy cost/latency stay null (the image model changed over time, so no
  // constant-cost backfill). Totals span text + image and are null only when
  // neither sidecar has data.
  image_provider: string | null;
  image_model: string | null;
  image_cost_usd: number | null;
  image_latency_ms: number | null;
  total_cost_usd: number | null;
  total_latency_ms: number | null;
  in_starter_pack: boolean;
  vote_score: number;
  status: "active" | "hidden";
  image_url: string | null;
  image_status: ImageStatus;
}

export interface InventoryPage {
  page: number;
  page_size: number;
  total: number;
  rows: InventoryRow[];
}

// Server-side filter set — mirrors GET /admin/cards/inventory's query params
// 1:1 (the server owns filtering/sorting; the corpus is too big to ship).
export interface InventoryFilters {
  pair?: string;
  q?: string;
  word?: string;
  model?: string;
  prompt_version?: string;
  provider?: string;
  audience?: string;
  absurdity?: string;
  status?: "active" | "hidden" | "";
  // Date-only values mean the whole named day (the server widens them).
  created_after?: string;
  created_before?: string;
}

function inventoryParams(filters: InventoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  return params;
}

// Sort keys are server-whitelisted (422 otherwise) — keep in sync with
// association_store.INVENTORY_SORT_COLUMNS.
export type InventorySortKey =
  | "created_at"
  | "id"
  | "word"
  | "model"
  | "cost"
  | "latency"
  | "tokens_in"
  | "tokens_out"
  | "image_cost"
  | "image_latency"
  | "total_cost"
  | "total_latency"
  | "vote_score";

export function fetchCardInventory(
  filters: InventoryFilters,
  opts: {
    sort?: InventorySortKey;
    order?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  } = {},
): Promise<InventoryPage> {
  const params = inventoryParams(filters);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.order) params.set("order", opts.order);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  return adminFetch<InventoryPage>(
    `/admin/cards/inventory?${params.toString()}`,
  );
}

// group=word rollup: one group per (pair, word) under the same filters,
// newest generation first. Expanding a group = the flat inventory with
// word= + pair= set.
export interface InventoryWordGroup {
  source_language: string;
  target_language: string;
  word: string;
  display_word: string;
  variant_count: number;
  active_count: number;
  // Spend split (VocabCards #464): text and image sidecars separately, and
  // their sum — null only when no variant has telemetry on that side.
  text_cost_usd: number | null;
  image_cost_usd: number | null;
  total_cost_usd: number | null;
  first_created_at: string;
  last_created_at: string;
}

export interface InventoryWordGroupPage {
  page: number;
  page_size: number;
  total: number;
  groups: InventoryWordGroup[];
}

export function fetchCardWordGroups(
  filters: InventoryFilters,
  page = 1,
  pageSize?: number,
): Promise<InventoryWordGroupPage> {
  const params = inventoryParams(filters);
  params.set("group", "word");
  params.set("page", String(page));
  if (pageSize) params.set("page_size", String(pageSize));
  return adminFetch<InventoryWordGroupPage>(
    `/admin/cards/inventory?${params.toString()}`,
  );
}

// Aggregate rollup under the same filters. Keys mirror the server's
// INVENTORY_STATS_GROUPS whitelist. Telemetry aggregates cover the
// with_telemetry subset (legacy rows have no sidecar).
export type InventoryStatsGroup =
  | "model"
  | "prompt_version"
  | "provider"
  | "audience"
  | "absurdity"
  | "pair"
  | "day";

export interface InventoryStatsRow {
  grp: string | null;
  count: number;
  with_telemetry: number;
  with_image_telemetry: number;
  // Cost split (VocabCards #464): text / image sidecars and their grand
  // total; latency averaged per sidecar plus per-row text+image totals.
  text_cost_usd: number | null;
  image_cost_usd: number | null;
  total_cost_usd: number | null;
  avg_latency_ms: number | null;
  avg_image_latency_ms: number | null;
  avg_total_latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  hidden: number;
}

export function fetchCardStats(
  filters: InventoryFilters,
  groupBy: InventoryStatsGroup,
): Promise<{ group_by: InventoryStatsGroup; rows: InventoryStatsRow[] }> {
  const params = inventoryParams(filters);
  params.set("group_by", groupBy);
  return adminFetch(`/admin/cards/stats?${params.toString()}`);
}

// Lineage/sibling summary rows on the detail payload.
export interface GenerationSummary {
  id: number;
  word: string;
  mnemonic: string;
  keyword: string | null;
  absurdity: string | null;
  model: string | null;
  prompt_version: string | null;
  image_id: string | null;
  image_url: string | null;
  image_status: ImageStatus;
  retired_at: string | null;
  status: "active" | "hidden";
  created_at: string;
}

// The expanded-row payload: everything too heavy or too niche for the list —
// raw LLM response, prompt inputs, regenerate lineage, sibling variants.
export interface CardGenerationDetail
  extends Omit<InventoryRow, "in_starter_pack" | "vote_score"> {
  word_info: WordInfo;
  input_definition: string | null;
  grandfathered: boolean;
  raw_response: string | null;
  provider_request_id: string | null;
  // The generating / image-rendering requests' PostHog $ai_trace_id
  // (VocabCards#480); null on rows stored before the server persisted them.
  trace_id: string | null;
  image_trace_id: string | null;
  error: string | null;
  parent: GenerationSummary | null;
  children: GenerationSummary[];
  siblings: GenerationSummary[];
}

export function fetchCardGenerationDetail(
  associationId: number,
): Promise<CardGenerationDetail> {
  return adminFetch<CardGenerationDetail>(
    `/admin/cards/${associationId}/details`,
  );
}
