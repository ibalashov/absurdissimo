"use client";

// Column registry for the Cards table (VocabCards #458): every column the
// picker offers, its renderer, and (when server-sortable) its whitelisted
// sort key. The table renders whatever subset the admin has toggled on —
// adding a column here is the whole job.

import type { ReactNode } from "react";
import {
  absurdityLabel,
  formatDateTime,
  languageFlag,
  languageName,
} from "@/lib/api";
import { adminImageUrl, type InventoryRow, type InventorySortKey } from "@/lib/admin";
import CardImage from "@/components/CardImage";
import { agoExact, fmtMs, fmtUsd } from "./util";

export interface InventoryColumn {
  key: string;
  label: string;
  numeric?: boolean;
  sortKey?: InventorySortKey;
  defaultVisible?: boolean;
  // Relative column width under the table's fixed layout. The page normalizes
  // the visible columns' weights to percentages summing to 100%, so the table
  // always fills the viewport exactly and never overflows horizontally,
  // whatever subset the picker has on. Omitted → DEFAULT_WEIGHT.
  weight?: number;
  render: (row: InventoryRow, ctx: { now: number }) => ReactNode;
}

// Widest text columns (Association, timestamps, model) earn the most room;
// short numeric/enum columns the least. The image column reserves enough for
// its 44px thumb box plus cell padding.
export const DEFAULT_WEIGHT = 5;

function pairCell(row: InventoryRow): ReactNode {
  return (
    <span
      title={`${languageName(row.source_language)} → ${languageName(row.target_language)}`}
    >
      {languageFlag(row.source_language) ?? row.source_language} →{" "}
      {languageFlag(row.target_language) ?? row.target_language}
    </span>
  );
}

export const COLUMNS: InventoryColumn[] = [
  {
    key: "id",
    label: "ID",
    numeric: true,
    sortKey: "id",
    weight: 3,
    render: (r) => r.id,
  },
  {
    key: "created_at",
    label: "Created (UTC)",
    sortKey: "created_at",
    defaultVisible: true,
    weight: 7,
    render: (r) => formatDateTime(r.created_at),
  },
  {
    key: "age",
    label: "Age",
    sortKey: "created_at",
    defaultVisible: true,
    weight: 6,
    render: (r, ctx) => agoExact(r.created_at, ctx.now),
  },
  {
    key: "pair",
    label: "Pair",
    defaultVisible: true,
    weight: 3,
    render: pairCell,
  },
  {
    key: "word",
    label: "Word",
    sortKey: "word",
    defaultVisible: true,
    weight: 6,
    render: (r) => <strong>{r.display_word}</strong>,
  },
  {
    key: "image",
    label: "Image",
    defaultVisible: true,
    // The fixed box keeps row height independent of the image outcome: a
    // 404'd thumb (CardImage renders null) used to collapse the row by
    // ~22px mid-scroll, jolting the whole table (#468).
    render: (r) => (
      <span className="cards-thumb-box">
        {r.image_url && r.image_status === "ready" ? (
          <CardImage
            className="cards-thumb"
            src={adminImageUrl(r.image_url, 96)}
            alt={r.display_word}
          />
        ) : (
          <span className="admin-muted">{r.image_status}</span>
        )}
      </span>
    ),
  },
  {
    key: "keyword",
    label: "Keyword",
    defaultVisible: true,
    weight: 6,
    render: (r) => r.keyword ?? "—",
  },
  {
    key: "mnemonic",
    label: "Association",
    defaultVisible: true,
    weight: 14,
    render: (r) => (
      <span className="cards-clip" title={r.mnemonic}>
        {r.mnemonic}
      </span>
    ),
  },
  {
    key: "model",
    label: "Model",
    sortKey: "model",
    defaultVisible: true,
    weight: 8,
    render: (r) => r.model ?? "—",
  },
  {
    key: "prompt_version",
    label: "Prompt v",
    numeric: true,
    defaultVisible: true,
    weight: 4,
    render: (r) => r.prompt_version ?? "—",
  },
  // Per-LLM-call cost/latency from the generation_calls sidecar (VocabCards
  // #621). A card fans out across the word_info lookup, the two-step keyword +
  // scene calls (or the oneshot fallback); each call is its own column. The
  // common two-step pair (keyword + scene) is default-visible; lookup and the
  // oneshot fallback are mostly-NULL, so they're opt-in via the picker, as is
  // the summed "Text total" (keyword+scene+oneshot) below — kept because it's
  // the only text figure legacy rows (no per-call breakdown) carry. All render
  // as — when null.
  {
    key: "lookup_cost",
    label: "Lookup cost",
    numeric: true,
    sortKey: "lookup_cost",
    weight: 5,
    render: (r) => fmtUsd(r.lookup_cost_usd),
  },
  {
    key: "lookup_latency",
    label: "Lookup lat",
    numeric: true,
    sortKey: "lookup_latency",
    weight: 5,
    render: (r) => fmtMs(r.lookup_latency_ms),
  },
  {
    key: "keyword_cost",
    label: "Keyword cost",
    numeric: true,
    sortKey: "keyword_cost",
    defaultVisible: true,
    weight: 5,
    render: (r) => fmtUsd(r.keyword_cost_usd),
  },
  {
    key: "keyword_latency",
    label: "Keyword lat",
    numeric: true,
    sortKey: "keyword_latency",
    defaultVisible: true,
    weight: 5,
    render: (r) => fmtMs(r.keyword_latency_ms),
  },
  {
    key: "scene_cost",
    label: "Scene cost",
    numeric: true,
    sortKey: "scene_cost",
    defaultVisible: true,
    weight: 5,
    render: (r) => fmtUsd(r.scene_cost_usd),
  },
  {
    key: "scene_latency",
    label: "Scene lat",
    numeric: true,
    sortKey: "scene_latency",
    defaultVisible: true,
    weight: 5,
    render: (r) => fmtMs(r.scene_latency_ms),
  },
  {
    key: "oneshot_cost",
    label: "1-shot cost",
    numeric: true,
    sortKey: "oneshot_cost",
    weight: 5,
    render: (r) => fmtUsd(r.oneshot_cost_usd),
  },
  {
    key: "oneshot_latency",
    label: "1-shot lat",
    numeric: true,
    sortKey: "oneshot_latency",
    weight: 5,
    render: (r) => fmtMs(r.oneshot_latency_ms),
  },
  {
    key: "cost",
    label: "Text total",
    numeric: true,
    sortKey: "cost",
    weight: 5,
    render: (r) => fmtUsd(r.cost_usd),
  },
  {
    key: "latency",
    label: "Text total lat",
    numeric: true,
    sortKey: "latency",
    weight: 5,
    render: (r) => fmtMs(r.latency_ms),
  },
  // Image-render telemetry (VocabCards #464). Legacy images predate the
  // sidecar: cost/latency render as — while the derived provider still shows.
  {
    key: "image_cost",
    label: "Img cost",
    numeric: true,
    sortKey: "image_cost",
    defaultVisible: true,
    render: (r) => fmtUsd(r.image_cost_usd),
  },
  {
    key: "image_latency",
    label: "Img latency",
    numeric: true,
    sortKey: "image_latency",
    defaultVisible: true,
    render: (r) => fmtMs(r.image_latency_ms),
  },
  {
    key: "total_cost",
    label: "Total cost",
    numeric: true,
    sortKey: "total_cost",
    defaultVisible: true,
    render: (r) => fmtUsd(r.total_cost_usd),
  },
  {
    key: "total_latency",
    label: "Total latency",
    numeric: true,
    sortKey: "total_latency",
    defaultVisible: true,
    render: (r) => fmtMs(r.total_latency_ms),
  },
  {
    key: "tokens_in",
    label: "Tok in",
    numeric: true,
    sortKey: "tokens_in",
    render: (r) => r.tokens_in ?? "—",
  },
  {
    key: "tokens_out",
    label: "Tok out",
    numeric: true,
    sortKey: "tokens_out",
    render: (r) => r.tokens_out ?? "—",
  },
  {
    key: "provider",
    label: "Provider",
    weight: 7,
    render: (r) => r.provider ?? "—",
  },
  {
    key: "image_provider",
    label: "Img provider",
    weight: 7,
    render: (r) => r.image_provider ?? "—",
  },
  {
    key: "image_model",
    label: "Img model",
    weight: 8,
    render: (r) => r.image_model ?? "—",
  },
  {
    key: "effort",
    label: "Effort",
    render: (r) => r.effort ?? "—",
  },
  {
    key: "absurdity",
    label: "Absurdity",
    render: (r) => (r.absurdity ? absurdityLabel(r.absurdity) : "—"),
  },
  {
    key: "strategy",
    label: "Strategy",
    weight: 7,
    render: (r) => r.strategy ?? "—",
  },
  {
    key: "audience",
    label: "Audience",
    render: (r) => r.audience ?? "—",
  },
  {
    key: "triggered_by",
    label: "Triggered by",
    weight: 9,
    render: (r) =>
      r.device_id ? (
        <span className="cards-clip-narrow" title={r.device_id}>
          {r.device_id}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "status",
    label: "Status",
    render: (r) => (
      <span className={`lab-status ${r.status === "hidden" ? "error" : "done"}`}>
        {r.status}
      </span>
    ),
  },
  {
    key: "image_status",
    label: "Img status",
    render: (r) => r.image_status,
  },
  {
    key: "regenerated",
    label: "Regen",
    render: (r) =>
      r.parent_generation_id !== null ? (
        <span title={`regenerated away from #${r.parent_generation_id}`}>
          ↻ #{r.parent_generation_id}
        </span>
      ) : (
        ""
      ),
  },
  {
    key: "in_starter_pack",
    label: "Pack",
    weight: 3,
    render: (r) => (r.in_starter_pack ? "📦" : ""),
  },
  {
    key: "vote_score",
    label: "Votes",
    numeric: true,
    sortKey: "vote_score",
    weight: 3,
    render: (r) => r.vote_score,
  },
];

export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultVisible).map(
  (c) => c.key,
);
