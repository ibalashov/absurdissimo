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
import { fetchThread } from "@/lib/community";
import {
  cardStackKey,
  errorMessage,
  fmtMs,
  fmtUsd,
  pairSlug,
  posthogCardEventsUrl,
  posthogLlmTracesUrl,
  posthogStackEventsUrl,
} from "./util";
import { useCards } from "./CardsContext";
import RegenerateImageButton from "../RegenerateImageButton";

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
  // Community entry id backing this generation, for the /c/{pair}/{word}/{entry}
  // permalink (VocabCards#507). Resolved via the public thread read — which
  // materializes AI entries server-side — so no admin endpoint is needed; null
  // while resolving or when the card has no entry (e.g. hidden).
  const [entryId, setEntryId] = useState<number | null>(null);

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

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setEntryId(null);
    const threadPair = pairSlug(detail.source_language, detail.target_language);
    fetchThread(threadPair, detail.word).then(
      (thread) => {
        if (cancelled) return;
        const entry = thread.entries.find(
          (e) => e.association_id === detail.id,
        );
        setEntryId(entry ? entry.id : null);
      },
      () => {
        // Best-effort: no permalink button when the thread read fails.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [detail]);

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
        <div className="cards-detail-media">
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
          <RegenerateImageButton
            card={{ association_id: detail.id, image_id: detail.image_id }}
            onReady={(fresh) =>
              setDetail((current) =>
                current
                  ? {
                      ...current,
                      image_id: fresh.image_id ?? null,
                      image_url: fresh.image_url ?? null,
                      image_status: fresh.image_status ?? "none",
                    }
                  : current,
              )
            }
          />
        </div>
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
            <Meta label="text cost" value={fmtUsd(detail.cost_usd)} />
            <Meta label="text latency" value={fmtMs(detail.latency_ms)} />
            <Meta label="img provider" value={detail.image_provider} />
            <Meta label="img model" value={detail.image_model} />
            <Meta label="img cost" value={fmtUsd(detail.image_cost_usd)} />
            <Meta label="img latency" value={fmtMs(detail.image_latency_ms)} />
            <Meta label="total cost" value={fmtUsd(detail.total_cost_usd)} />
            <Meta label="total latency" value={fmtMs(detail.total_latency_ms)} />
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
        {entryId !== null && (
          <Link
            className="admin-btn"
            href={`/c/${pair}/${encodeURIComponent(detail.word)}/${entryId}`}
            target="_blank"
          >
            Permalink ↗
          </Link>
        )}
        <a
          className="admin-btn"
          href={posthogCardEventsUrl(detail.id)}
          target="_blank"
          rel="noreferrer"
        >
          Card events ↗
        </a>
        <a
          className="admin-btn"
          href={posthogStackEventsUrl(
            cardStackKey(detail.source_language, detail.target_language, detail.word),
          )}
          target="_blank"
          rel="noreferrer"
        >
          Stack events ↗
        </a>
        <a
          className="admin-btn"
          href={posthogLlmTracesUrl(
            [detail.trace_id, detail.image_trace_id],
            detail.created_at,
          )}
          target="_blank"
          rel="noreferrer"
        >
          LLM traces ↗
        </a>
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
