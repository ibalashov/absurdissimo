"use client";

import { useEffect, useMemo, useState } from "react";
import MnemonicText from "@/components/MnemonicText";
import { absurdityLabel, formatDate, languageFlag, languageName, type PairSummary } from "@/lib/api";
import {
  fetchAdminPairs,
  fetchLabConfigs,
  fetchLabPrompts,
  fetchLabRun,
  fetchLabRuns,
  fetchRuntimeSettings,
  pickLabGeneration,
  startLabRun,
  type LabConfig,
  type LabGeneration,
  type LabPromptsResponse,
  type LabRun,
} from "@/lib/admin";
import { ABSURDITIES, DEFAULT_ABSURDITY, errorMessage, fmtMs, fmtUsd, judgeScores, PROD_PROMPT_REF } from "../util";

const KEYWORD_PROMPT = "builtin:two-step-keywords-v1";
const SCENE_PROMPT = "builtin:two-step-scene-v1";
const JUDGE_USD_PER_WORD = 0.0305;

function JudgeChip({ gen }: { gen: LabGeneration }) {
  if (gen.judge_total == null) return null;
  const scores = judgeScores(gen.judge_scores);
  const title = scores ? Object.entries(scores).map(([key, value]) => `${key}: ${value}`).join("\n") : gen.judge_model ?? undefined;
  return <span className="lab-chip judge" title={title}>judge {gen.judge_total}</span>;
}

function StepDetails({ gen }: { gen: LabGeneration }) {
  if (gen.flow !== "two_step" || !gen.steps?.length) return null;
  return <div className="two-step-steps">{gen.steps.map((step, index) => <span key={`${step.step}-${index}`}><strong>{step.step}</strong> {fmtMs(step.latency_ms)} · {fmtUsd(step.cost_usd)}</span>)}</div>;
}

function CandidateList({ gen }: { gen: LabGeneration }) {
  const candidates = gen.candidates;
  if (gen.flow !== "two_step" || !candidates) return null;
  const offered = new Set(candidates.offered);
  return <div className="two-step-candidates">
    <div className="two-step-candidate-head"><strong>Keyword candidates</strong>{candidates.off_list && <span className="two-step-off-list">⚠ OFF-LIST FINAL KEYWORD</span>}</div>
    {candidates.raw.length === 0 ? <p className="admin-muted">No candidates returned.</p> : <ol>{candidates.raw.map((candidate, index) => {
      const reason = candidates.rejected[candidate];
      const final = candidate === gen.keyword;
      return <li key={`${candidate}-${index}`} className={reason ? "rejected" : offered.has(candidate) ? "survivor" : ""}>
        <span dir="auto">{candidate}</span>{reason && <span className="two-step-reason">rejected: {reason}</span>}{final && <span className="lab-chip final">final</span>}
      </li>;
    })}</ol>}
    {gen.keyword && !candidates.raw.includes(gen.keyword) && <div className="two-step-final-offlist"><span dir="auto">{gen.keyword}</span><span className="lab-chip final">final</span></div>}
  </div>;
}

function ResultCard({ arm, gen, running, picked, onPick }: { arm: "A" | "B"; gen?: LabGeneration; running: boolean; picked: boolean; onPick: () => void }) {
  const label = arm === "A" ? "A · one-shot" : "B · two-step";
  const head = <div className="lab-gen-head"><span className="lab-chip two-step-arm">{label}</span>{picked && <span className="lab-picked-badge">✓ picked</span>}</div>;
  if (!gen) return <div className="lab-gen-card pending">{head}<p className="admin-muted">{running ? "generating…" : "no result"}</p></div>;
  const content = <><StepDetails gen={gen} /><CandidateList gen={gen} /></>;
  if (gen.error) return <div className={`lab-gen-card failed${gen.error === "no valid keyword candidates" ? " zero-survivors" : ""}`}>{head}{content}<p className="lab-gen-error">{gen.error === "no valid keyword candidates" ? "Zero survivors — no valid keyword candidates; scene step was not run." : gen.error}</p></div>;
  return <div className={`lab-gen-card${picked ? " picked" : ""}`} role="button" tabIndex={0} title="Pick as this word's winner" onClick={onPick} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(); } }}>
    {head}{content}
    {gen.keyword && <div className="lab-gen-keyword" dir="auto">{gen.keyword}</div>}
    {gen.mnemonic && <p className="lab-gen-mnemonic" dir="auto"><MnemonicText text={gen.mnemonic} keyword={gen.keyword} /></p>}
    {gen.explanation && <p className="lab-gen-explanation" dir="auto">{gen.explanation}</p>}
    <div className="lab-gen-meta"><JudgeChip gen={gen} /><span className="lab-chip">{fmtMs(gen.latency_ms)}</span><span className="lab-chip">{fmtUsd(gen.cost_usd)}</span></div>
  </div>;
}

function ConfigSelect({ value, onChange, configs }: { value: string; onChange: (value: string) => void; configs: LabConfig[] | null }) {
  return <select className="admin-input" value={value} onChange={(event) => onChange(event.target.value)} disabled={!configs?.length}>{(configs ?? []).map((config) => <option key={config.key} value={config.key}>{config.key} · {config.model}</option>)}</select>;
}

function PromptSelect({ value, onChange, prompts, includeProd = false, builtinRef }: { value: string; onChange: (value: string) => void; prompts: LabPromptsResponse | null; includeProd?: boolean; builtinRef?: string }) {
  return <select className="admin-input" value={value} onChange={(event) => onChange(event.target.value)}>
    {includeProd && <option value={prompts?.prod.ref ?? value}>{prompts?.prod.ref ?? value} · production</option>}
    {(prompts?.builtins ?? []).filter((prompt) => prompt.ref === builtinRef).map((prompt) => <option key={prompt.ref} value={prompt.ref}>{prompt.ref} · {prompt.name}</option>)}
    {(prompts?.prompts ?? []).map((prompt) => <option key={prompt.id} value={`lab:${prompt.id}`}>lab:{prompt.id} · {prompt.name}</option>)}
  </select>;
}

function PromptBody({ promptRef, prompts }: { promptRef: string; prompts: LabPromptsResponse | null }) {
  const builtin = prompts?.builtins?.find((item) => item.ref === promptRef);
  if (!builtin) return null;
  return <details className="two-step-prompt"><summary>View {builtin.name} body</summary><pre>{builtin.body}</pre></details>;
}

export default function TwoStepLabPage() {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [pair, setPair] = useState("");
  const [configs, setConfigs] = useState<LabConfig[] | null>(null);
  const [configA, setConfigA] = useState("");
  const [configB, setConfigB] = useState("");
  const [prompts, setPrompts] = useState<LabPromptsResponse | null>(null);
  const [promptA, setPromptA] = useState(PROD_PROMPT_REF);
  const [keywordPrompt, setKeywordPrompt] = useState(KEYWORD_PROMPT);
  const [scenePrompt, setScenePrompt] = useState(SCENE_PROMPT);
  const [oversample, setOversample] = useState(10);
  const [absurdity, setAbsurdity] = useState(DEFAULT_ABSURDITY);
  const [wordText, setWordText] = useState("");
  const [judge, setJudge] = useState(true);
  const [starting, setStarting] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [run, setRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPicks, setLocalPicks] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<LabRun[] | null>(null);

  const words = useMemo(() => wordText.split(/[,\s]+/).map((item) => item.trim()).filter((item, index, all) => item && all.findIndex((candidate) => candidate.toLocaleLowerCase() === item.toLocaleLowerCase()) === index), [wordText]);

  async function refreshHistory() {
    try { const page = await fetchLabRuns(undefined, 1); setHistory(page.runs.filter((item) => item.configs?.some((config) => config.flow === "two_step"))); }
    catch (reason) { setError(errorMessage(reason)); }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAdminPairs(), fetchLabConfigs(), fetchRuntimeSettings(), fetchLabPrompts()]).then(([allPairs, configData, settings, promptData]) => {
      if (cancelled) return;
      const initial = configData.configs.find((item) => item.model === settings.effective.model)?.key ?? configData.configs[0]?.key ?? "";
      setPairs(allPairs); setPair(allPairs[0]?.pair ?? ""); setConfigs(configData.configs); setConfigA(initial); setConfigB(initial); setPrompts(promptData); setPromptA(promptData.prod.ref);
    }, (reason: unknown) => { if (!cancelled) setError(errorMessage(reason)); });
    return () => { cancelled = true; };
  }, []);

  const runStatus = run?.status;
  useEffect(() => { if (runStatus !== "running") void refreshHistory(); }, [runStatus]);
  useEffect(() => {
    if (runId == null) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => { try { const fresh = await fetchLabRun(runId); if (cancelled) return; setRun(fresh); setError(null); if (fresh.status === "running") timer = setTimeout(() => void poll(), 2000); } catch (reason) { if (!cancelled) setError(errorMessage(reason)); } };
    void poll(); return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [runId]);

  const selectedA = configs?.find((item) => item.key === configA);
  const selectedB = configs?.find((item) => item.key === configB);
  const keywordUnit = selectedB ? (selectedB.input_usd_per_mtok * 1000 + selectedB.output_usd_per_mtok * 300) / 1_000_000 : 0;
  const projected = words.length * ((selectedA?.unit_price_usd ?? 0) + (selectedB?.unit_price_usd ?? 0) + keywordUnit + (judge ? JUDGE_USD_PER_WORD : 0));
  const picks = useMemo(() => ({ ...Object.fromEntries((run?.picks ?? []).map((pick) => [pick.word, pick.generation_id])), ...localPicks }), [run, localPicks]);
  const byWord = useMemo(() => { const result = new Map<string, Partial<Record<"one_shot" | "two_step", LabGeneration>>>(); for (const gen of run?.generations ?? []) if (gen.flow === "one_shot" || gen.flow === "two_step") result.set(gen.word, { ...result.get(gen.word), [gen.flow]: gen }); return result; }, [run]);
  const summary = useMemo(() => (["one_shot", "two_step"] as const).map((flow) => {
    const all = (run?.generations ?? []).filter((gen) => gen.flow === flow);
    const good = all.filter((gen) => !gen.error);
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const candidateGens = all.filter((gen) => gen.candidates);
    return { flow, judge: mean(good.flatMap((gen) => gen.judge_total == null ? [] : [gen.judge_total])), cost: mean(all.flatMap((gen) => gen.cost_usd == null ? [] : [gen.cost_usd])), latency: mean(all.flatMap((gen) => gen.latency_ms == null ? [] : [gen.latency_ms])), picks: all.filter((gen) => picks[gen.word] === gen.id).length, raw: mean(candidateGens.map((gen) => gen.candidates!.raw.length)), surviving: mean(candidateGens.map((gen) => gen.candidates!.offered.length)), zero: candidateGens.length ? candidateGens.filter((gen) => gen.candidates!.offered.length === 0).length / candidateGens.length : null, offList: candidateGens.length ? candidateGens.filter((gen) => gen.candidates!.off_list).length / candidateGens.length : null };
  }), [run, picks]);

  async function start() { setStarting(true); setError(null); setRun(null); setLocalPicks({}); try { const result = await startLabRun({ pair, absurdity, words, configs: [{ key: configA, prompt_ref: promptA, flow: "one_shot" }, { key: configB, prompt_ref: scenePrompt, flow: "two_step", keyword_prompt_ref: keywordPrompt, oversample }], judge }); setRunId(result.run_id); } catch (reason) { setError(errorMessage(reason)); } finally { setStarting(false); } }
  async function pick(word: string, gen: LabGeneration) { try { await pickLabGeneration(run!.id, word, gen.id); setLocalPicks((current) => ({ ...current, [word]: gen.id })); } catch (reason) { setError(errorMessage(reason)); } }
  function openRun(id: number) { if (id === runId) return; setLocalPicks({}); setRun(null); setError(null); setRunId(id); }

  return <>
    <h1>Two-step lab</h1><p className="admin-intro">Compare one-shot generation with a keyword-first pipeline that filters candidates before building the scene.</p>
    <section className="admin-pane"><h2>Setup</h2>
      <div className="pack-toolbar"><label className="pack-toolbar-label" htmlFor="two-step-pair">Pair</label><select id="two-step-pair" className="admin-input" value={pair} onChange={(event) => setPair(event.target.value)} disabled={!pairs?.length}>{(pairs ?? []).map((item) => <option key={item.pair} value={item.pair}>{languageFlag(item.source_language)} {languageName(item.source_language)} → {languageFlag(item.target_language)} {languageName(item.target_language)}</option>)}</select><label className="pack-toolbar-label" htmlFor="two-step-absurdity">Absurdity</label><select id="two-step-absurdity" className="admin-input" value={absurdity} onChange={(event) => setAbsurdity(event.target.value)}>{ABSURDITIES.map((item) => <option key={item} value={item}>{item} · {absurdityLabel(item)}</option>)}</select></div>
      <h3 className="lab-subhead">Words</h3><textarea className="admin-input lab-textarea two-step-word-input" rows={5} placeholder="Words separated by commas, spaces, or newlines" value={wordText} onChange={(event) => setWordText(event.target.value)} /><p className="admin-muted">{words.length} unique words</p>
      <div className="two-step-arm-setup"><div><h3>Arm A · one-shot</h3><label>Model config<ConfigSelect value={configA} onChange={setConfigA} configs={configs} /></label><label>Prompt<PromptSelect value={promptA} onChange={setPromptA} prompts={prompts} includeProd /></label></div>
      <div><h3>Arm B · two-step</h3><label>Model config<ConfigSelect value={configB} onChange={setConfigB} configs={configs} /></label><label>Keyword prompt<PromptSelect value={keywordPrompt} onChange={setKeywordPrompt} prompts={prompts} builtinRef={KEYWORD_PROMPT} /></label><PromptBody promptRef={keywordPrompt} prompts={prompts} /><label>Scene prompt<PromptSelect value={scenePrompt} onChange={setScenePrompt} prompts={prompts} builtinRef={SCENE_PROMPT} /></label><PromptBody promptRef={scenePrompt} prompts={prompts} /><label>Oversample N<input className="admin-input two-step-number" type="number" min={1} max={25} value={oversample} onChange={(event) => setOversample(Math.max(1, Math.min(25, Number(event.target.value) || 1)))} /></label></div></div>
      <label className="lab-band"><input type="checkbox" checked={judge} onChange={(event) => setJudge(event.target.checked)} /> Judge results</label>
      <div className="lab-run-row"><span className="lab-cost">{words.length} words × 2 arms ≈ <strong>{fmtUsd(projected)}</strong></span><button className="admin-btn primary" disabled={starting || !pair || !configA || !configB || words.length === 0} onClick={() => void start()}>{starting ? "Starting…" : "Run two-step lab"}</button></div>{error && <p className="admin-error">{error}</p>}
    </section>
    <section className="admin-pane"><h2>Past runs</h2>{history == null ? <p className="admin-muted">Loading…</p> : history.length === 0 ? <p className="admin-muted">No two-step runs yet.</p> : <ul className="two-step-history">{history.map((item) => <li key={item.id}><button className={`two-step-history-row${item.id === runId ? " active" : ""}`} onClick={() => openRun(item.id)}><span className="two-step-history-id">#{item.id}</span><span>{languageFlag(item.source_language)}→{languageFlag(item.target_language)}</span><span>{formatDate(item.created_at)}</span><span>{item.words.length} words</span><span>{fmtUsd(item.actual_cost_usd)}</span><span className={`lab-status ${item.status}`}>{item.status}</span></button></li>)}</ul>}</section>
    {run && <section className="admin-pane"><div className="lab-run-header"><h2>Run #{run.id}</h2><span className={`lab-status ${run.status}`}>{run.status}</span>{run.status === "running" && <span className="admin-muted">refreshing every 2 s…</span>}</div>
      {run.words.map((word) => { const gens = byWord.get(word); return <div className="lab-word-group" key={word}><h3 className="lab-word-title" dir="auto">{word}</h3><div className="two-step-result-grid"><ResultCard arm="A" gen={gens?.one_shot} running={run.status === "running"} picked={gens?.one_shot?.id === picks[word]} onPick={() => { if (gens?.one_shot) void pick(word, gens.one_shot); }} /><ResultCard arm="B" gen={gens?.two_step} running={run.status === "running"} picked={gens?.two_step?.id === picks[word]} onPick={() => { if (gens?.two_step) void pick(word, gens.two_step); }} /></div></div>; })}
      <h3 className="lab-subhead">Summary</h3><div className="lab-table-scroll"><table className="lab-table"><thead><tr><th>Arm</th><th className="num">Mean judge</th><th className="num">Mean cost</th><th className="num">Mean latency</th><th className="num">Picks</th><th className="num">Candidates raw→surviving</th><th className="num">Zero survivors</th><th className="num">Off-list</th></tr></thead><tbody>{summary.map((row) => <tr key={row.flow}><td>{row.flow === "one_shot" ? "A · one-shot" : "B · two-step"}</td><td className="num">{row.judge?.toFixed(1) ?? "—"}</td><td className="num">{fmtUsd(row.cost)}</td><td className="num">{fmtMs(row.latency)}</td><td className="num">{row.picks}</td><td className="num">{row.flow === "two_step" && row.raw != null && row.surviving != null ? `${row.raw.toFixed(1)} → ${row.surviving.toFixed(1)}` : "—"}</td><td className="num">{row.zero == null ? "—" : `${(row.zero * 100).toFixed(1)}%`}</td><td className="num">{row.offList == null ? "—" : `${(row.offList * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>
    </section>}
  </>;
}
