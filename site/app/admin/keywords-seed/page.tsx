"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { languageFlag, languageName, type PairSummary } from "@/lib/api";
import {
  fetchAdminPairs,
  fetchKeywordSeedSets,
  fetchKeywordSeedStatus,
  fetchRuntimeSettings,
  isAdminStatus,
  previewKeywordSeed,
  startKeywordSeed,
  type KeywordSeedPreview,
  type KeywordSeedSet,
  type KeywordSeedStatus,
} from "@/lib/admin";

const PREVIEW_DEBOUNCE_MS = 400;
const STATUS_POLL_MS = 2000;
const COST_CAP_USD = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function parseWords(text: string): string[] {
  const words: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,]+/)) {
    const word = raw.trim();
    if (!word) continue;
    const key = word.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value < 0.1 ? value.toFixed(4) : value.toFixed(2)}`;
}

function setLabel(set: KeywordSeedSet, index: number): string {
  return set.name?.trim() || `seed-${set.words.length || index + 1}`;
}

export default function KeywordsSeedPage() {
  const [pairs, setPairs] = useState<PairSummary[]>([]);
  const [pair, setPair] = useState("");
  const [sets, setSets] = useState<KeywordSeedSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [wordsText, setWordsText] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [effortOptions, setEffortOptions] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<string | null>(null);
  const [preview, setPreview] = useState<KeywordSeedPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [status, setStatus] = useState<KeywordSeedStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const previewSequence = useRef(0);

  const words = useMemo(() => parseWords(wordsText), [wordsText]);
  const request = useMemo(
    () => ({ pair, words, model, reasoning_effort: reasoningEffort }),
    [pair, words, model, reasoningEffort],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminPairs(), fetchRuntimeSettings()]).then(
      ([freshPairs, settings]) => {
        if (cancelled) return;
        setPairs(freshPairs);
        setPair(freshPairs[0]?.pair ?? "");
        setModelOptions(settings.model_options);
        setEffortOptions(settings.reasoning_effort_options);
        setModel(settings.effective.model);
        setReasoningEffort(settings.effective.reasoning_effort);
      },
      (error: unknown) => {
        if (!cancelled) setPreviewError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pair) return;
    let cancelled = false;
    setSetsLoading(true);
    setSets([]);
    setWordsText("");
    fetchKeywordSeedSets(pair).then(
      (response) => {
        if (cancelled) return;
        // Be defensive while retaining only usable entries if an older server
        // sends nulls or malformed set rows.
        const usable = Array.isArray(response?.sets)
          ? response.sets.filter(
              (item): item is KeywordSeedSet =>
                !!item && Array.isArray(item.words),
            )
          : [];
        setSets(usable);
        setPreviewError(null);
      },
      (error: unknown) => {
        if (!cancelled) setPreviewError(errorMessage(error));
      },
    ).finally(() => {
      if (!cancelled) setSetsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pair]);

  useEffect(() => {
    const sequence = ++previewSequence.current;
    setPreview(null);
    setPreviewError(null);
    if (!pair || !model || words.length === 0) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      previewKeywordSeed(request).then(
        (fresh) => {
          if (previewSequence.current !== sequence) return;
          setPreview(fresh);
          setPreviewError(null);
          setPreviewLoading(false);
        },
        (error: unknown) => {
          if (previewSequence.current !== sequence) return;
          setPreviewError(errorMessage(error));
          setPreviewLoading(false);
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request, pair, model, words.length]);

  const pollStatus = useCallback(async () => {
    const fresh = await fetchKeywordSeedStatus();
    setStatus(fresh);
    setStatusError(null);
    return fresh;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const fresh = await pollStatus();
        if (!cancelled && fresh.active) {
          timer = setTimeout(() => void tick(), STATUS_POLL_MS);
        }
      } catch (error) {
        if (!cancelled) setStatusError(errorMessage(error));
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [pollStatus, status?.active]);

  async function run() {
    if (!preview || preview.projected_usd > COST_CAP_USD) return;
    setStarting(true);
    setStatusError(null);
    try {
      const fresh = await startKeywordSeed(request);
      setStatus(fresh);
    } catch (error) {
      setStatusError(
        isAdminStatus(error, 409)
          ? "A run is already active."
          : errorMessage(error),
      );
    } finally {
      setStarting(false);
    }
  }

  const previewStale = preview === null || previewLoading;
  const overCap = (preview?.projected_usd ?? 0) > COST_CAP_USD;
  const running = status?.active === true;
  const finished = status && !status.active && status.pair && status.total != null;

  return (
    <>
      <h1>Keywords seed</h1>
      <p className="admin-intro">
        Seed keyword candidates in bulk, then review and rank the generated
        candidates before they are served.
      </p>

      <section className="admin-pane">
        <h2>Words</h2>
        <div className="keywords-seed-controls">
          <label>
            <span className="keywords-seed-label">Language pair</span>
            <select
              className="admin-input"
              value={pair}
              onChange={(event) => setPair(event.target.value)}
            >
              {!pairs.length && <option value="">Loading pairs…</option>}
              {pairs.map((item) => (
                <option key={item.pair} value={item.pair}>
                  {languageFlag(item.source_language) ?? ""}{" "}
                  {languageName(item.source_language)} →{" "}
                  {languageFlag(item.target_language) ?? ""}{" "}
                  {languageName(item.target_language)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="keywords-seed-label">Seed set</span>
            <div className="keywords-seed-sets">
              {sets.map((set, index) => (
                <button
                  type="button"
                  className="admin-btn"
                  key={`${setLabel(set, index)}-${index}`}
                  onClick={() => setWordsText(set.words.join("\n"))}
                >
                  {setLabel(set, index)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {setsLoading ? (
          <p className="admin-muted">Loading seed sets…</p>
        ) : sets.length === 0 ? (
          <p className="admin-muted">
            No curated seed sets are available for this pair. Enter words
            manually below.
          </p>
        ) : null}
        <label className="keywords-seed-editor">
          <span className="keywords-seed-label">
            Word editor <strong>{words.length.toLocaleString("en-US")}</strong>
          </span>
          <textarea
            className="admin-input"
            value={wordsText}
            rows={12}
            placeholder="Comma, space, or newline separated words…"
            onChange={(event) => setWordsText(event.target.value)}
          />
        </label>
        <p className="admin-pane-hint">
          Duplicates are counted once, case-insensitively. Selecting a set
          replaces the editor; you retain full manual control afterward.
        </p>
      </section>

      <section className="admin-pane">
        <h2>Generation</h2>
        <div className="keywords-seed-controls">
          <label>
            <span className="keywords-seed-label">Model</span>
            <select
              className="admin-input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            >
              {modelOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="keywords-seed-label">Reasoning effort</span>
            <select
              className="admin-input"
              value={reasoningEffort ?? ""}
              onChange={(event) =>
                setReasoningEffort(event.target.value || null)
              }
            >
              <option value="">Unset (model default)</option>
              {effortOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="keywords-seed-preview" aria-live="polite">
          <div>
            <span>Total</span>
            <strong>{preview?.total ?? "—"}</strong>
          </div>
          <div>
            <span>Already covered</span>
            <strong>{preview?.already_covered ?? "—"}</strong>
          </div>
          <div>
            <span>Pending</span>
            <strong>{preview?.pending ?? "—"}</strong>
          </div>
          <div className="cost">
            <span>Projected cost</span>
            <strong>{previewLoading ? "Updating…" : usd(preview?.projected_usd)}</strong>
          </div>
        </div>
        {preview && (
          <p className="admin-pane-hint">
            Conservative unit estimate: {usd(preview.unit_estimate_usd)} per
            pending word.
          </p>
        )}
        {previewError && <p className="admin-error">{previewError}</p>}
        {overCap && (
          <p className="admin-error">
            Projected cost exceeds the $5.00 server cap. Reduce the word list
            before running.
          </p>
        )}
        {previewStale && words.length > 0 && !previewError && (
          <p className="admin-muted">Waiting for a current cost preview…</p>
        )}
        <button
          type="button"
          className="admin-btn primary keywords-seed-run"
          disabled={
            starting || running || previewStale || overCap || words.length === 0
          }
          onClick={() => void run()}
        >
          {starting ? "Starting…" : running ? "Run active…" : "Run seed"}
        </button>
      </section>

      <section className="admin-pane">
        <h2>Run status</h2>
        {statusError && <p className="admin-error">{statusError}</p>}
        {!status && !statusError && (
          <p className="admin-muted">Loading run status…</p>
        )}
        {status && status.total == null && !status.active && (
          <p className="admin-muted">No seed run has started yet.</p>
        )}
        {status && (status.active || status.total != null) && (
          <>
            <div className="keywords-seed-status" aria-live="polite">
              <span className={`word-info-status ${status.active ? "live" : "ok"}`}>
                {status.active ? "active" : "finished"}
              </span>
              <span>
                Completed <strong>{status.completed ?? 0}</strong> /{" "}
                {status.total ?? "—"}
              </span>
              <span>
                Pending <strong>{status.pending ?? 0}</strong>
              </span>
              <span>
                Skipped <strong>{status.skipped ?? 0}</strong>
              </span>
              <span>
                Spend <strong>{usd(status.spent_usd)}</strong>
              </span>
            </div>
            {status.current_word && (
              <p>
                Current word: <strong>{status.current_word}</strong>
              </p>
            )}
            {status.error && <p className="admin-error">{status.error}</p>}
          </>
        )}
        {finished && (
          <Link
            className="admin-btn primary keywords-seed-review"
            href={`/admin/keywords?pair=${encodeURIComponent(status.pair!)}&status=candidate`}
          >
            Review candidate keywords
          </Link>
        )}
      </section>
    </>
  );
}
