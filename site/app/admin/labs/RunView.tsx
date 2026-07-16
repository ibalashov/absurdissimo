"use client";

// One run's results (VocabCards #426): polls GET /admin/labs/runs/{id} every
// ~2 s while the run is "running" and renders generations incrementally,
// grouped by word — one card per run config entry. Entries are keyed by
// (config_key, prompt_ref), not bare key: the prompt-variant axis (VocabCards
// #427) lets the same config appear twice with different prompts. Runs where
// everything is prod render exactly as before — the prompt chip and the
// summary's Prompt column appear only when a non-prod prompt is involved.
// Tapping a card records it as the word's winner via PUT .../picks; that
// endpoint lands with VocabCards#425, so a 404/405 degrades to a "picks not
// available yet" notice instead of an error. Judge fields (judge_total /
// judge_scores_json) likewise render only when present — absent means #425
// isn't deployed yet, so they're omitted silently.

import { useEffect, useMemo, useState } from "react";
import MnemonicText from "@/components/MnemonicText";
import {
  absurdityLabel,
  formatDateTime,
  languageFlag,
  languageName,
} from "@/lib/api";
import {
  AdminApiError,
  fetchLabRun,
  pickLabGeneration,
  type LabConfig,
  type LabGeneration,
  type LabPrompt,
  type LabRun,
} from "@/lib/admin";
import {
  PROD_PROMPT_REF,
  entryKey,
  errorMessage,
  fmtMs,
  fmtUsd,
  isProdPromptRef,
  judgeScores,
  promptLabel,
} from "./util";

const RUN_POLL_MS = 2000;

const PICKS_UNAVAILABLE_NOTICE =
  "Winner picks aren't stored yet — the server side ships with VocabCards#425. Your tap wasn't recorded.";

// Per-dimension judge breakdown as a plain-text tooltip on the score chip.
function judgeTitle(gen: LabGeneration): string | undefined {
  const scores = judgeScores(gen.judge_scores);
  const entries = Object.entries(scores ?? {});
  const lines = entries
    .filter(([, v]) => typeof v === "number")
    .map(([dim, score]) => `${dim}: ${score}`);
  const justification = entries.find(([k]) => k === "justification")?.[1];
  if (typeof justification === "string" && justification) {
    lines.push(justification);
  }
  if (gen.judge_model) lines.push(`judge: ${gen.judge_model}`);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

// One generation card. The whole card is the pick target (role=button); a
// missing generation renders a queued/no-result placeholder and a failed one
// renders its error — neither is pickable.
function GenCard({
  config,
  promptChip,
  gen,
  running,
  picked,
  onPick,
}: {
  config: LabConfig;
  // Rendered only for runs that use a non-prod prompt somewhere (#427);
  // null keeps all-prod runs looking exactly as before.
  promptChip: { label: string; ref: string } | null;
  gen: LabGeneration | undefined;
  running: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const head = (
    <div className="lab-gen-head">
      <span className="lab-chip">{config.key}</span>
      <span className="lab-chip">{config.model}</span>
      {promptChip && (
        <span className="lab-chip prompt" title={promptChip.ref}>
          {promptChip.label}
        </span>
      )}
      {picked && <span className="lab-picked-badge">✓ picked</span>}
    </div>
  );

  if (!gen) {
    return (
      <div className="lab-gen-card pending">
        {head}
        <p className="admin-muted">{running ? "generating…" : "no result"}</p>
      </div>
    );
  }

  if (gen.error) {
    return (
      <div className="lab-gen-card failed">
        {head}
        <p className="lab-gen-error">{gen.error}</p>
        <div className="lab-gen-meta">
          {gen.latency_ms != null && (
            <span className="lab-chip">{fmtMs(gen.latency_ms)}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`lab-gen-card${picked ? " picked" : ""}`}
      role="button"
      tabIndex={0}
      title="Pick as this word's winner"
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      {head}
      {gen.keyword && (
        <div className="lab-gen-keyword" dir="auto">
          {gen.keyword}
        </div>
      )}
      {gen.mnemonic && (
        <p className="lab-gen-mnemonic" dir="auto">
          <MnemonicText text={gen.mnemonic} keyword={gen.keyword} />
        </p>
      )}
      {gen.explanation && (
        <p className="lab-gen-explanation" dir="auto">
          {gen.explanation}
        </p>
      )}
      <div className="lab-gen-meta">
        {gen.strategy && <span className="lab-chip">{gen.strategy}</span>}
        {gen.judge_total != null && (
          <span className="lab-chip judge" title={judgeTitle(gen)}>
            judge {gen.judge_total}
          </span>
        )}
        <span className="lab-chip">{fmtMs(gen.latency_ms)}</span>
        <span className="lab-chip">{fmtUsd(gen.cost_usd)}</span>
        {gen.tokens_in != null && gen.tokens_out != null && (
          <span className="lab-chip">
            {gen.tokens_in}→{gen.tokens_out} tok
          </span>
        )}
      </div>
    </div>
  );
}

type SortKey = "config" | "judge" | "latency" | "cost" | "picks";

interface SummaryRow {
  id: string;
  key: string;
  promptRef: string;
  judge: number | null;
  latency: number | null;
  cost: number | null;
  picks: number;
}

export default function RunView({
  runId,
  prompts,
}: {
  runId: number;
  prompts: LabPrompt[] | null;
}) {
  const [run, setRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the Retry button to restart a poll that stopped on an error.
  const [pollNonce, setPollNonce] = useState(0);
  const [picksNotice, setPicksNotice] = useState<string | null>(null);
  // Optimistic winner marks layered over the server's picks list, so a tap
  // shows immediately on finished runs (which are no longer polled).
  const [localPicks, setLocalPicks] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: "config",
    asc: true,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const fresh = await fetchLabRun(runId);
        if (cancelled) return;
        setRun(fresh);
        setError(null);
        if (fresh.status === "running") {
          timer = setTimeout(() => void tick(), RUN_POLL_MS);
        }
      } catch (err) {
        // Stop polling on an error and let the Retry button restart it —
        // hammering a failing endpoint every 2 s helps nobody.
        if (!cancelled) setError(errorMessage(err));
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [runId, pollNonce]);

  // Effective winner per word: the server's picks overlaid with this
  // session's optimistic ones.
  const picks = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of run?.picks ?? []) map[p.word] = p.generation_id;
    return { ...map, ...localPicks };
  }, [run, localPicks]);

  // Non-prod anywhere in the run → show prompt chips and the Prompt column;
  // otherwise the view is byte-identical to the pre-#427 rendering.
  const hasLabPrompt = (run?.configs ?? []).some(
    (c) => !isProdPromptRef(c.prompt_ref ?? PROD_PROMPT_REF),
  );

  const byWord = useMemo(() => {
    const map = new Map<string, Map<string, LabGeneration>>();
    for (const g of run?.generations ?? []) {
      let inner = map.get(g.word);
      if (!inner) {
        inner = new Map();
        map.set(g.word, inner);
      }
      // Keyed by (config_key, prompt_ref): the same config may run twice
      // with different prompts (#427).
      inner.set(entryKey(g.config_key, g.prompt_ref), g);
    }
    return map;
  }, [run]);

  // The run's word list drives the grouping; any generation for a word the
  // run object doesn't list (defensive) is appended rather than dropped.
  const words = useMemo(() => {
    const list = [...(run?.words ?? [])];
    const seen = new Set(list);
    for (const w of byWord.keys()) {
      if (!seen.has(w)) {
        list.push(w);
        seen.add(w);
      }
    }
    return list;
  }, [run, byWord]);

  const genById = useMemo(() => {
    const map = new Map<number, LabGeneration>();
    for (const g of run?.generations ?? []) map.set(g.id, g);
    return map;
  }, [run]);

  const summary = useMemo<SummaryRow[]>(() => {
    if (!run) return [];
    const pickedIds = Object.values(picks);
    // One row per run config entry — (config_key, prompt_ref), since the same
    // key may appear with different prompts (#427).
    const rows = run.configs.map((c, i) => {
      const ref = c.prompt_ref ?? PROD_PROMPT_REF;
      const matches = (g: LabGeneration) =>
        g.config_key === c.key &&
        (g.prompt_ref ?? PROD_PROMPT_REF) === ref;
      const gens = (run.generations ?? []).filter(
        (g) => matches(g) && !g.error,
      );
      const mean = (values: number[]): number | null =>
        values.length > 0
          ? values.reduce((s, v) => s + v, 0) / values.length
          : null;
      return {
        id: `${entryKey(c.key, ref)}#${i}`,
        key: c.key,
        promptRef: ref,
        judge: mean(
          gens.map((g) => g.judge_total).filter((v): v is number => v != null),
        ),
        latency: mean(
          gens.map((g) => g.latency_ms).filter((v): v is number => v != null),
        ),
        cost: mean(
          gens.map((g) => g.cost_usd).filter((v): v is number => v != null),
        ),
        picks: pickedIds.filter((id) => {
          const g = genById.get(id);
          return g !== undefined && matches(g);
        }).length,
      };
    });
    const dir = sort.asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "config") {
        return (
          (a.key.localeCompare(b.key) ||
            a.promptRef.localeCompare(b.promptRef)) * dir
        );
      }
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // missing metrics sort last either way
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [run, picks, genById, sort]);

  function toggleSort(key: SortKey) {
    setSort((cur) =>
      cur.key === key ? { key, asc: !cur.asc } : { key, asc: key === "config" },
    );
  }

  async function pick(word: string, gen: LabGeneration) {
    try {
      await pickLabGeneration(runId, word, gen.id);
      setLocalPicks((cur) => ({ ...cur, [word]: gen.id }));
      setPicksNotice(null);
    } catch (err) {
      setPicksNotice(
        err instanceof AdminApiError &&
          (err.status === 404 || err.status === 405)
          ? PICKS_UNAVAILABLE_NOTICE
          : errorMessage(err),
      );
    }
  }

  if (!run) {
    return (
      <section className="admin-pane">
        <h2>Run #{runId}</h2>
        {error ? (
          <>
            <p className="admin-error">{error}</p>
            <button
              className="admin-btn"
              onClick={() => setPollNonce((n) => n + 1)}
            >
              Retry
            </button>
          </>
        ) : (
          <p className="admin-muted">Loading run…</p>
        )}
      </section>
    );
  }

  const totalExpected = run.words.length * run.configs.length;
  const doneCount = run.generations?.length ?? 0;

  const sortableHeader = (key: SortKey, label: string, numeric: boolean) => (
    <th className={numeric ? "num" : undefined} scope="col">
      <button
        className={`lab-sort-btn${sort.key === key ? " active" : ""}`}
        onClick={() => toggleSort(key)}
      >
        {label}
        {sort.key === key ? (sort.asc ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <section className="admin-pane">
      <div className="lab-run-header">
        <h2>Run #{run.id}</h2>
        <span className={`lab-status ${run.status}`}>{run.status}</span>
        <span className="lab-chip">
          {languageFlag(run.source_language) ?? ""}{" "}
          {languageName(run.source_language)} →{" "}
          {languageFlag(run.target_language) ?? ""}{" "}
          {languageName(run.target_language)}
        </span>
        <span className="lab-chip">
          {run.absurdity} · {absurdityLabel(run.absurdity)}
        </span>
        <span className="lab-chip">{formatDateTime(run.created_at)}</span>
        <span className="lab-chip">
          projected {fmtUsd(run.projected_cost_usd)}
        </span>
        {run.actual_cost_usd != null && (
          <span className="lab-chip">actual {fmtUsd(run.actual_cost_usd)}</span>
        )}
      </div>

      {run.status === "running" && (
        <p className="admin-muted">
          Generating — {doneCount} / {totalExpected} done, refreshing every 2
          s…
        </p>
      )}
      {error && (
        <p className="admin-error">
          {error}{" "}
          <button
            className="admin-btn"
            onClick={() => setPollNonce((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {picksNotice && <p className="admin-notice">{picksNotice}</p>}
      {run.status !== "running" && totalExpected > 0 && doneCount === 0 && (
        <p className="admin-muted">This run produced no generations.</p>
      )}

      {words.map((word) => {
        const gens = byWord.get(word);
        const pickedId = picks[word];
        return (
          <div className="lab-word-group" key={word}>
            <h3 className="lab-word-title" dir="auto">
              {word}
            </h3>
            <div className="lab-gen-grid">
              {run.configs.map((config, i) => {
                const ref = config.prompt_ref ?? PROD_PROMPT_REF;
                const gen = gens?.get(entryKey(config.key, ref));
                return (
                  <GenCard
                    key={`${entryKey(config.key, ref)}#${i}`}
                    config={config}
                    promptChip={
                      hasLabPrompt
                        ? { label: promptLabel(ref, prompts), ref }
                        : null
                    }
                    gen={gen}
                    running={run.status === "running"}
                    picked={gen !== undefined && gen.id === pickedId}
                    onPick={() => {
                      if (gen) void pick(word, gen);
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <h3 className="lab-subhead">Summary</h3>
      <div className="lab-table-scroll">
        <table className="lab-table">
          <thead>
            <tr>
              {sortableHeader("config", "Config", false)}
              {hasLabPrompt && <th scope="col">Prompt</th>}
              {sortableHeader("judge", "Mean judge", true)}
              {sortableHeader("latency", "Mean latency", true)}
              {sortableHeader("cost", "Mean cost", true)}
              {sortableHeader("picks", "Picks", true)}
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.id}>
                <td className="lab-config-key">{row.key}</td>
                {hasLabPrompt && (
                  <td title={row.promptRef}>
                    {promptLabel(row.promptRef, prompts)}
                  </td>
                )}
                <td className="num">
                  {row.judge != null ? row.judge.toFixed(1) : "—"}
                </td>
                <td className="num">{fmtMs(row.latency)}</td>
                <td className="num">{fmtUsd(row.cost)}</td>
                <td className="num">{row.picks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
