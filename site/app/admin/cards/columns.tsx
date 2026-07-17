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
  render: (row: InventoryRow, ctx: { now: number }) => ReactNode;
}

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
    render: (r) => r.id,
  },
  {
    key: "created_at",
    label: "Created (UTC)",
    sortKey: "created_at",
    defaultVisible: true,
    render: (r) => formatDateTime(r.created_at),
  },
  {
    key: "age",
    label: "Age",
    sortKey: "created_at",
    defaultVisible: true,
    render: (r, ctx) => agoExact(r.created_at, ctx.now),
  },
  {
    key: "pair",
    label: "Pair",
    defaultVisible: true,
    render: pairCell,
  },
  {
    key: "word",
    label: "Word",
    sortKey: "word",
    defaultVisible: true,
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
            src={adminImageUrl(r.image_url)}
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
    render: (r) => r.keyword ?? "—",
  },
  {
    key: "mnemonic",
    label: "Association",
    defaultVisible: true,
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
    render: (r) => r.model ?? "—",
  },
  {
    key: "prompt_version",
    label: "Prompt v",
    numeric: true,
    defaultVisible: true,
    render: (r) => r.prompt_version ?? "—",
  },
  {
    key: "cost",
    label: "Text cost",
    numeric: true,
    sortKey: "cost",
    defaultVisible: true,
    render: (r) => fmtUsd(r.cost_usd),
  },
  {
    key: "latency",
    label: "Text latency",
    numeric: true,
    sortKey: "latency",
    defaultVisible: true,
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
    render: (r) => r.provider ?? "—",
  },
  {
    key: "image_provider",
    label: "Img provider",
    render: (r) => r.image_provider ?? "—",
  },
  {
    key: "image_model",
    label: "Img model",
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
    render: (r) => (r.in_starter_pack ? "📦" : ""),
  },
  {
    key: "vote_score",
    label: "Votes",
    numeric: true,
    sortKey: "vote_score",
    render: (r) => r.vote_score,
  },
];

export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultVisible).map(
  (c) => c.key,
);
