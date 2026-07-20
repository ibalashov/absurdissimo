"use client";

import { useEffect, useMemo, useState } from "react";
import MnemonicText from "@/components/MnemonicText";
import { absurdityLabel, languageFlag, languageName, type PairSummary } from "@/lib/api";
import {
  fetchAdminPairs,
  fetchLabConfigs,
  fetchLabPrompts,
  fetchLabRun,
  fetchRuntimeSettings,
  lookupAccentWords,
  pickLabGeneration,
  sampleAccentWords,
  startLabRun,
  type AccentDivergence,
  type AccentWord,
  type LabConfig,
  type LabGeneration,
  type LabRun,
} from "@/lib/admin";
import { ABSURDITIES, DEFAULT_ABSURDITY, errorMessage, fmtMs, fmtUsd, judgeScores, PROD_PROMPT_REF } from "../util";

const DEFAULT_SAMPLE_COUNT = 24;
const JUDGE_USD_PER_WORD = 0.0305;
const DIVERGENCES: AccentDivergence[] = ["stress", "vowel", "rhoticity"];

function JudgeChip({ gen }: { gen: LabGeneration }) {
  if (gen.judge_total == null) return null;
  const scores = judgeScores(gen.judge_scores);
  const title = scores
    ? Object.entries(scores).map(([key, value]) => `${key}: ${value}`).join("\n")
    : gen.judge_model ?? undefined;
  return <span className="lab-chip judge" title={title}>judge {gen.judge_total}</span>;
}

function ResultCard({ arm, gen, running, picked, onPick }: {
  arm: "US" | "Both";
  gen?: LabGeneration;
  running: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const head = <div className="lab-gen-head"><span className="lab-chip accent-arm">{arm}</span>{arm === "Both" && gen?.chosen_accent && <span className="lab-chip">{gen.chosen_accent === "uk" ? "🇬🇧 UK" : "🇺🇸 US"}</span>}{picked && <span className="lab-picked-badge">✓ picked</span>}</div>;
  if (!gen) return <div className="lab-gen-card pending">{head}<p className="admin-muted">{running ? "generating…" : "no result"}</p></div>;
  if (gen.error) return <div className="lab-gen-card failed">{head}<p className="lab-gen-error">{gen.error}</p></div>;
  return <div className={`lab-gen-card${picked ? " picked" : ""}`} role="button" tabIndex={0} title="Pick as this word's winner" onClick={onPick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(); } }}>
    {head}
    {gen.keyword && <div className="lab-gen-keyword" dir="auto">{gen.keyword}</div>}
    {gen.mnemonic && <p className="lab-gen-mnemonic" dir="auto"><MnemonicText text={gen.mnemonic} keyword={gen.keyword} /></p>}
    {gen.explanation && <p className="lab-gen-explanation" dir="auto">{gen.explanation}</p>}
    <div className="lab-gen-meta"><JudgeChip gen={gen} /><span className="lab-chip">{fmtMs(gen.latency_ms)}</span><span className="lab-chip">{fmtUsd(gen.cost_usd)}</span></div>
  </div>;
}

export default function AccentLabPage() {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [pair, setPair] = useState("");
  const [configs, setConfigs] = useState<LabConfig[] | null>(null);
  const [configKey, setConfigKey] = useState("");
  const [prodRef, setProdRef] = useState(PROD_PROMPT_REF);
  const [absurdity, setAbsurdity] = useState(DEFAULT_ABSURDITY);
  const [count, setCount] = useState(DEFAULT_SAMPLE_COUNT);
  const [words, setWords] = useState<AccentWord[]>([]);
  const [manual, setManual] = useState("");
  const [adding, setAdding] = useState(false);
  const [judge, setJudge] = useState(true);
  const [sampling, setSampling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [run, setRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPicks, setLocalPicks] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminPairs(), fetchLabConfigs(), fetchRuntimeSettings(), fetchLabPrompts()]).then(
      ([allPairs, configData, settings, prompts]) => {
        if (cancelled) return;
        const englishPairs = allPairs.filter((item) => item.source_language === "english");
        setPairs(englishPairs);
        setPair(englishPairs[0]?.pair ?? "");
        setConfigs(configData.configs);
        setConfigKey(configData.configs.find((item) => item.model === settings.effective.model)?.key ?? configData.configs[0]?.key ?? "");
        setProdRef(prompts.prod.ref);
      },
      (reason: unknown) => { if (!cancelled) setError(errorMessage(reason)); },
    );
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (runId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const fresh = await fetchLabRun(runId);
        if (cancelled) return;
        setRun(fresh);
        setError(null);
        if (fresh.status === "running") timer = setTimeout(() => void poll(), 2000);
      } catch (reason) { if (!cancelled) setError(errorMessage(reason)); }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [runId]);

  const selectedConfig = configs?.find((item) => item.key === configKey);
  const projected = words.length * ((selectedConfig?.unit_price_usd ?? 0) * 2 + (judge ? JUDGE_USD_PER_WORD : 0));
  const picks = useMemo(() => ({ ...Object.fromEntries((run?.picks ?? []).map((pick) => [pick.word, pick.generation_id])), ...localPicks }), [run, localPicks]);
  const byWord = useMemo(() => {
    const result = new Map<string, Partial<Record<"us" | "both", LabGeneration>>>();
    for (const gen of run?.generations ?? []) {
      if (gen.ipa_mode === "us" || gen.ipa_mode === "both") result.set(gen.word, { ...result.get(gen.word), [gen.ipa_mode]: gen });
    }
    return result;
  }, [run]);

  const summary = useMemo(() => (["us", "both"] as const).map((mode) => {
    const gens = (run?.generations ?? []).filter((gen) => gen.ipa_mode === mode && !gen.error);
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return { mode, judge: mean(gens.flatMap((gen) => gen.judge_total == null ? [] : [gen.judge_total])), cost: mean(gens.flatMap((gen) => gen.cost_usd == null ? [] : [gen.cost_usd])), latency: mean(gens.flatMap((gen) => gen.latency_ms == null ? [] : [gen.latency_ms])), picks: gens.filter((gen) => picks[gen.word] === gen.id).length };
  }), [run, picks]);

  async function sample() {
    setSampling(true); setError(null);
    try { setWords((await sampleAccentWords(pair, count)).words); } catch (reason) { setError(errorMessage(reason)); } finally { setSampling(false); }
  }
  async function addManual() {
    const entered = manual.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
    if (!entered.length) return;
    setAdding(true); setError(null);
    try {
      const found = (await lookupAccentWords(entered)).words;
      setWords((current) => [...current, ...found.filter((item) => !current.some((existing) => existing.word === item.word))]);
      setManual("");
    } catch (reason) { setError(errorMessage(reason)); } finally { setAdding(false); }
  }
  async function start() {
    setStarting(true); setError(null); setRun(null); setLocalPicks({});
    try {
      const result = await startLabRun({ pair, absurdity, words: words.map((item) => item.word), configs: [
        { key: configKey, prompt_ref: prodRef, ipa_mode: "us" },
        { key: configKey, prompt_ref: prodRef, ipa_mode: "both" },
      ], judge });
      setRunId(result.run_id);
    } catch (reason) { setError(errorMessage(reason)); } finally { setStarting(false); }
  }
  async function pick(word: string, gen: LabGeneration) {
    try { await pickLabGeneration(run!.id, word, gen.id); setLocalPicks((current) => ({ ...current, [word]: gen.id })); } catch (reason) { setError(errorMessage(reason)); }
  }

  return <>
    <h1>Accent lab</h1>
    <p className="admin-intro">Compare the production prompt with US IPA only against the same prompt with both US and UK pronunciations.</p>
    <section className="admin-pane">
      <h2>Setup</h2>
      <div className="pack-toolbar">
        <label className="pack-toolbar-label" htmlFor="accent-pair">Pair</label>
        <select id="accent-pair" className="admin-input" value={pair} onChange={(event) => { setPair(event.target.value); setWords([]); }} disabled={!pairs?.length}>{(pairs ?? []).map((item) => <option key={item.pair} value={item.pair}>{languageFlag(item.source_language)} {languageName(item.source_language)} → {languageFlag(item.target_language)} {languageName(item.target_language)}</option>)}</select>
        <label className="pack-toolbar-label" htmlFor="accent-absurdity">Absurdity</label>
        <select id="accent-absurdity" className="admin-input" value={absurdity} onChange={(event) => setAbsurdity(event.target.value)}>{ABSURDITIES.map((item) => <option key={item} value={item}>{item} · {absurdityLabel(item)}</option>)}</select>
      </div>
      <div className="accent-sample-row"><label className="pack-toolbar-label" htmlFor="accent-count">Count</label><input id="accent-count" className="admin-input pack-target-input" type="number" min={1} max={200} value={count} onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} /><button className="admin-btn" disabled={!pair || sampling} onClick={() => void sample()}>{sampling ? "Sampling…" : "Sample random words"}</button></div>
      <div className="accent-sample-row"><input className="admin-input accent-manual-input" placeholder="Add your own words (comma- or space-separated)" value={manual} onChange={(event) => setManual(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addManual(); } }} /><button className="admin-btn" disabled={adding || !manual.trim()} onClick={() => void addManual()}>{adding ? "Adding…" : "Add"}</button></div>
      {words.length > 0 && <ul className="accent-word-list">{words.map((item) => <li key={item.word}><strong dir="auto">{item.word}</strong>{item.ipa_us && item.ipa_uk ? <><span>/ {item.ipa_us} / 🇺🇸</span><span>/ {item.ipa_uk} / 🇬🇧</span><span className={`lab-chip divergence ${item.divergence}`}>{item.divergence}</span></> : <span className="lab-chip accent-usonly" title="Not in the GA/RP divergence fixture — the Both arm falls back to the resolved US pronunciation">US-only</span>}<button className="accent-remove" aria-label={`Remove ${item.word}`} onClick={() => setWords((current) => current.filter((word) => word.word !== item.word))}>×</button></li>)}</ul>}
      <h3 className="lab-subhead">Model</h3>
      <div className="accent-model-row"><select className="admin-input" value={configKey} onChange={(event) => setConfigKey(event.target.value)} disabled={!configs?.length}>{(configs ?? []).map((item) => <option key={item.key} value={item.key}>{item.key} · {item.model}</option>)}</select><label className="lab-band"><input type="checkbox" checked={judge} onChange={(event) => setJudge(event.target.checked)} /> Judge results</label></div>
      <div className="lab-run-row"><span className="lab-cost">{words.length} words × 2 arms ≈ <strong>{fmtUsd(projected)}</strong></span><button className="admin-btn primary" disabled={starting || !pair || !configKey || words.length === 0} onClick={() => void start()}>{starting ? "Starting…" : "Run accent lab"}</button></div>
      {error && <p className="admin-error">{error}</p>}
    </section>
    {run && <section className="admin-pane">
      <div className="lab-run-header"><h2>Run #{run.id}</h2><span className={`lab-status ${run.status}`}>{run.status}</span>{run.status === "running" && <span className="admin-muted">refreshing every 2 s…</span>}</div>
      {run.words.map((word) => { const info = run.accent_words?.[word]; const gens = byWord.get(word); return <div className="lab-word-group" key={word}><div className="accent-word-head"><h3 className="lab-word-title" dir="auto">{word}</h3>{info && <><span>/ {info.ipa_us} / 🇺🇸</span><span>/ {info.ipa_uk} / 🇬🇧</span><span className={`lab-chip divergence ${info.divergence}`}>{info.divergence}</span></>}</div><div className="accent-result-grid"><ResultCard arm="US" gen={gens?.us} running={run.status === "running"} picked={gens?.us?.id === picks[word]} onPick={() => { if (gens?.us) void pick(word, gens.us); }} /><ResultCard arm="Both" gen={gens?.both} running={run.status === "running"} picked={gens?.both?.id === picks[word]} onPick={() => { if (gens?.both) void pick(word, gens.both); }} /></div></div>; })}
      <h3 className="lab-subhead">Summary</h3><div className="lab-table-scroll"><table className="lab-table"><thead><tr><th>Arm</th><th className="num">Mean judge</th><th className="num">Mean cost</th><th className="num">Mean latency</th><th className="num">Picks</th></tr></thead><tbody>{summary.map((row) => <tr key={row.mode}><td>{row.mode === "us" ? "US" : "Both"}</td><td className="num">{row.judge?.toFixed(1) ?? "—"}</td><td className="num">{fmtUsd(row.cost)}</td><td className="num">{fmtMs(row.latency)}</td><td className="num">{row.picks}</td></tr>)}</tbody></table></div>
      <h3 className="lab-subhead">Both arm choosing UK</h3><div className="lab-table-scroll"><table className="lab-table"><thead><tr><th>Divergence</th><th className="num">UK choices</th></tr></thead><tbody>{DIVERGENCES.map((divergence) => { const matching = (run.generations ?? []).filter((gen) => gen.ipa_mode === "both" && run.accent_words?.[gen.word]?.divergence === divergence && !gen.error); const uk = matching.filter((gen) => gen.chosen_accent === "uk").length; return <tr key={divergence}><td>{divergence}</td><td className="num">{matching.length ? `${((uk / matching.length) * 100).toFixed(1)}% (${uk}/${matching.length})` : "—"}</td></tr>; })}</tbody></table></div>
    </section>}
  </>;
}
