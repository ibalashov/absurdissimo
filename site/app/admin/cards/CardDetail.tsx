"use client";

// Expanded-row detail (VocabCards #458): lazily fetches
// GET /admin/cards/{id}/details — the full association row, its telemetry
// including the raw LLM response, the prompt inputs, regenerate lineage, and
// sibling variants. Shared by the table's expanded row and the gallery's
// detail panel.

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime, languageName } from "@/lib/api";
import {
  adminImageUrl,
  fetchCardGenerationDetail,
  hideAdminCard,
  type CardGenerationDetail,
  type GenerationSummary,
} from "@/lib/admin";
import CardImage from "@/components/CardImage";
import { errorMessage, fmtMs, fmtUsd, pairSlug } from "./util";
import { useCards } from "./CardsContext";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="cards-meta-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SummaryList({
  title,
  items,
  currentWord,
}: {
  title: string;
  items: GenerationSummary[];
  currentWord?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="cards-lineage">
      <h4>{title}</h4>
      <ul>
        {items.map((s) => (
          <li key={s.id}>
            <span className="admin-muted">#{s.id}</span>{" "}
            {s.word !== currentWord && <strong>{s.word}</strong>}{" "}
            <span className="cards-clip" title={s.mnemonic}>
              {s.mnemonic}
            </span>{" "}
            <span className="admin-muted">
              {s.model ?? ""} · {formatDateTime(s.created_at)}
              {s.status === "hidden" ? " · hidden" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CardDetail({
  associationId,
  onHidden,
}: {
  associationId: number;
  // Called after a successful hide so the parent view can refresh.
  onHidden?: () => void;
}) {
  const { setFilters } = useCards();
  const [detail, setDetail] = useState<CardGenerationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setConfirmingHide(false);
    fetchCardGenerationDetail(associationId).then(
      (d) => {
        if (!cancelled) setDetail(d);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [associationId]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!detail) return <p className="admin-muted">Loading…</p>;

  const pair = pairSlug(detail.source_language, detail.target_language);
  const info = detail.word_info;

  async function hide() {
    if (!confirmingHide) {
      setConfirmingHide(true);
      return;
    }
    setHiding(true);
    try {
      await hideAdminCard(associationId, pair);
      onHidden?.();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setHiding(false);
      setConfirmingHide(false);
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(detail, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions) — nothing useful to do.
    }
  }

  return (
    <div className="cards-detail">
      <div className="cards-detail-main">
        {detail.image_url && detail.image_status === "ready" && (
          <a
            href={adminImageUrl(detail.image_url)}
            target="_blank"
            rel="noreferrer"
            className="cards-detail-img"
          >
            <CardImage
              className="cards-detail-image"
              src={adminImageUrl(detail.image_url)}
              alt={detail.display_word}
            />
          </a>
        )}
        <div className="cards-detail-text">
          <h3>
            {detail.display_word}
            {detail.keyword && (
              <span className="cards-detail-keyword"> · {detail.keyword}</span>
            )}
            {detail.status === "hidden" && (
              <span className="lab-status error">hidden</span>
            )}
          </h3>
          <p className="cards-detail-mnemonic">{detail.mnemonic}</p>
          <p className="admin-muted">{detail.explanation}</p>

          <dl className="cards-meta">
            <Meta label="id" value={`#${detail.id}`} />
            <Meta
              label="pair"
              value={`${languageName(detail.source_language)} → ${languageName(detail.target_language)}`}
            />
            <Meta label="created" value={formatDateTime(detail.created_at)} />
            <Meta label="model" value={detail.model} />
            <Meta label="provider" value={detail.provider} />
            <Meta label="effort" value={detail.effort} />
            <Meta label="prompt v" value={detail.prompt_version} />
            <Meta label="absurdity" value={detail.absurdity} />
            <Meta label="strategy" value={detail.strategy} />
            <Meta label="audience" value={detail.audience} />
            <Meta label="triggered by" value={detail.device_id} />
            <Meta label="provenance" value={detail.provenance} />
            <Meta label="cost" value={fmtUsd(detail.cost_usd)} />
            <Meta label="latency" value={fmtMs(detail.latency_ms)} />
            <Meta
              label="tokens"
              value={
                detail.tokens_in != null || detail.tokens_out != null
                  ? `${detail.tokens_in ?? "?"} in / ${detail.tokens_out ?? "?"} out`
                  : null
              }
            />
            <Meta label="request id" value={detail.provider_request_id} />
            <Meta
              label="grandfathered"
              value={detail.grandfathered ? "yes" : null}
            />
            <Meta
              label="hidden at"
              value={detail.retired_at ? formatDateTime(detail.retired_at) : null}
            />
          </dl>

          {detail.error && (
            <p className="admin-error">Generation error: {detail.error}</p>
          )}
        </div>
      </div>

      {(info || detail.input_definition) && (
        <div className="cards-detail-block">
          <h4>Prompt inputs</h4>
          <dl className="cards-meta">
            <Meta label="definition fed" value={detail.input_definition} />
            <Meta label="dictionary definition" value={info?.definition} />
            <Meta label="transcription" value={info?.transcription} />
            <Meta label="gender" value={info?.gender} />
            <Meta label="emoji" value={info?.emoji} />
          </dl>
        </div>
      )}

      {detail.raw_response && (
        <details className="cards-raw">
          <summary>Raw LLM response</summary>
          <pre>{detail.raw_response}</pre>
        </details>
      )}

      <SummaryList
        title="Regenerated away from"
        items={detail.parent ? [detail.parent] : []}
        currentWord={detail.word}
      />
      <SummaryList
        title="Regenerated into"
        items={detail.children}
        currentWord={detail.word}
      />
      <SummaryList
        title={`Other variants of “${detail.display_word}”`}
        items={detail.siblings}
        currentWord={detail.word}
      />

      <div className="cards-detail-actions">
        <Link
          className="admin-btn"
          href={`/c/${pair}/${encodeURIComponent(detail.word)}`}
          target="_blank"
        >
          Community thread ↗
        </Link>
        <button
          className="admin-btn"
          type="button"
          onClick={() => setFilters({ word: detail.word, pair })}
        >
          Filter to this word
        </button>
        <button className="admin-btn" type="button" onClick={copyJson}>
          {copied ? "Copied ✓" : "Copy JSON"}
        </button>
        {detail.status === "active" && (
          <button
            className="admin-btn"
            type="button"
            onClick={hide}
            disabled={hiding}
          >
            {hiding
              ? "Hiding…"
              : confirmingHide
                ? "Really hide? (reversible)"
                : "Hide card"}
          </button>
        )}
      </div>
    </div>
  );
}
