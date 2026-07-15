"use client";

// Batch setup (VocabCards #426): pair + absurdity selectors, the config
// checklist from GET /admin/labs/configs (provider/model/params/unit price
// shown, a sensible default subset pre-checked), and the word list assembled
// from any mix of manual entry, a themed suggestion (reusing the starter-pack
// suggest endpoint), and a corpus sample with zipf-band + count controls.
// Each checked config runs with a chosen prompt (VocabCards #427, prod:v4 by
// default), and "extra entries" repeat a config key with a different prompt —
// the run request always uses the (key, prompt_ref) `configs` form.
// The projected cost renders live next to Run — that display is the epic's
// cost-confirmation mechanism; the server rejects > $5 batches with a 422
// whose message is surfaced verbatim below the button.

import { useEffect, useMemo, useState } from "react";
import {
  absurdityLabel,
  languageFlag,
  languageName,
  type PairSummary,
} from "@/lib/api";
import {
  fetchLabConfigs,
  sampleLabWords,
  startLabRun,
  suggestStarterBatch,
  type LabConfig,
  type LabPrompt,
  type LabRunConfigEntry,
} from "@/lib/admin";
import {
  ABSURDITIES,
  DEFAULT_ABSURDITY,
  PROD_PROMPT_REF,
  errorMessage,
  fmtUsd,
  mergeWordList,
  parseWordList,
} from "./util";

// Pre-checked when the server offers them: a cheap + strong config per major
// provider makes a sensible default comparison set without checking the whole
// roster. Unknown keys are simply skipped; if none match, everything is
// checked instead of leaving an all-unchecked list.
const DEFAULT_CONFIG_KEYS = new Set([
  "gemini-flash",
  "gpt55-min",
  "sonnet",
  "haiku",
]);

const SAMPLE_BANDS = ["common", "mid", "rare"] as const;
const DEFAULT_WORD_COUNT = 10;

function paramsSummary(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(
      ([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    )
    .join(" ");
}

// Compact prompt picker: prod plus every saved template (#427). Rendered
// inside the config-row <label>, but selects are interactive content, so
// clicking one doesn't toggle the row's checkbox.
function PromptSelect({
  value,
  onChange,
  prompts,
  ariaLabel,
}: {
  value: string;
  onChange: (ref: string) => void;
  prompts: LabPrompt[] | null;
  ariaLabel: string;
}) {
  return (
    <select
      className="admin-input lab-prompt-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      <option value={PROD_PROMPT_REF}>{PROD_PROMPT_REF}</option>
      {(prompts ?? []).map((p) => (
        <option key={p.id} value={`lab:${p.id}`}>
          {p.name} (lab:{p.id})
        </option>
      ))}
    </select>
  );
}

export default function BatchSetup({
  pairs,
  pair,
  setPair,
  prompts,
  onRunStarted,
}: {
  pairs: PairSummary[] | null;
  pair: string;
  setPair: (pair: string) => void;
  prompts: LabPrompt[] | null;
  onRunStarted: (runId: number) => void;
}) {
  const [configs, setConfigs] = useState<LabConfig[] | null>(null);
  const [configsError, setConfigsError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Prompt per checked config key; absent means prod:v4 (#427).
  const [promptByKey, setPromptByKey] = useState<Record<string, string>>({});
  // Extra (key, prompt) entries beyond the checklist — the way to run the
  // same config twice with different prompts.
  const [extras, setExtras] = useState<
    { key: string; promptRef: string }[]
  >([]);
  const [absurdity, setAbsurdity] = useState<string>(DEFAULT_ABSURDITY);
  const [wordsText, setWordsText] = useState("");
  const [count, setCount] = useState(DEFAULT_WORD_COUNT);
  const [bands, setBands] = useState<Set<string>>(new Set(SAMPLE_BANDS));
  const [scene, setScene] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [sampling, setSampling] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLabConfigs().then(
      ({ configs: list }) => {
        if (cancelled) return;
        setConfigs(list);
        const preset = list
          .filter((c) => DEFAULT_CONFIG_KEYS.has(c.key))
          .map((c) => c.key);
        setChecked(new Set(preset.length > 0 ? preset : list.map((c) => c.key)));
      },
      (err: unknown) => {
        if (!cancelled) setConfigsError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const words = useMemo(() => parseWordList(wordsText), [wordsText]);
  const checkedConfigs = (configs ?? []).filter((c) => checked.has(c.key));
  const configByKey = useMemo(
    () => new Map((configs ?? []).map((c) => [c.key, c])),
    [configs],
  );
  // The run's entries: every checked config with its chosen prompt, then the
  // extra rows — in the server's config-list order, not check order. Prompt
  // choice doesn't change unit price, so cost math counts entries.
  const entries: LabRunConfigEntry[] = [
    ...checkedConfigs.map((c) => ({
      key: c.key,
      prompt_ref: promptByKey[c.key] ?? PROD_PROMPT_REF,
    })),
    ...extras.map((ex) => ({ key: ex.key, prompt_ref: ex.promptRef })),
  ];
  // Mirrors the server's projection: per-card unit prices plus one rubric-judge
  // call per word (VocabCards#425, ~2500 in / ~600 out at gpt-5.5 prices). The
  // server's number is authoritative; this display just shouldn't undershoot it.
  const JUDGE_USD_PER_WORD = 0.0305;
  const projected =
    words.length *
      entries.reduce(
        (s, e) => s + (configByKey.get(e.key)?.unit_price_usd ?? 0),
        0,
      ) +
    words.length * (entries.length > 0 ? JUDGE_USD_PER_WORD : 0);

  function toggleConfig(key: string) {
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setPromptFor(key: string, ref: string) {
    setPromptByKey((cur) => ({ ...cur, [key]: ref }));
  }

  function addExtra() {
    const key = checkedConfigs[0]?.key ?? (configs ?? [])[0]?.key;
    if (!key) return;
    setExtras((cur) => [...cur, { key, promptRef: PROD_PROMPT_REF }]);
  }

  function updateExtra(index: number, patch: Partial<{ key: string; promptRef: string }>) {
    setExtras((cur) =>
      cur.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)),
    );
  }

  function removeExtra(index: number) {
    setExtras((cur) => cur.filter((_, i) => i !== index));
  }

  function toggleBand(band: string) {
    setBands((cur) => {
      const next = new Set(cur);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }

  async function suggest() {
    setSuggesting(true);
    setWordsError(null);
    try {
      const batch = await suggestStarterBatch(pair, count);
      setScene(batch.scene);
      setWordsText((cur) => mergeWordList(cur, batch.words));
    } catch (err) {
      setWordsError(errorMessage(err));
    } finally {
      setSuggesting(false);
    }
  }

  async function sample() {
    setSampling(true);
    setWordsError(null);
    try {
      const sampled = await sampleLabWords(pair, count, [...bands]);
      setWordsText((cur) => mergeWordList(cur, sampled.words));
    } catch (err) {
      setWordsError(errorMessage(err));
    } finally {
      setSampling(false);
    }
  }

  async function run() {
    setStarting(true);
    setRunError(null);
    try {
      const res = await startLabRun({
        pair,
        absurdity,
        words,
        // Always the (key, prompt_ref) form — config_keys is legacy (#427).
        configs: entries,
      });
      onRunStarted(res.run_id);
    } catch (err) {
      // Includes the server's 422 over-the-$5-cap message verbatim.
      setRunError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="admin-pane">
      <h2>New batch</h2>
      <p className="admin-pane-hint">
        Pick the configs to compare and assemble a word list — type words in,
        suggest a themed batch, or sample the pair&rsquo;s corpus. Every word
        runs through every checked config.
      </p>

      <div className="pack-toolbar">
        <label className="pack-toolbar-label" htmlFor="lab-pair">
          Pair
        </label>
        <select
          id="lab-pair"
          className="admin-input"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          disabled={!pairs || pairs.length === 0}
        >
          {(pairs ?? []).map((p) => (
            <option key={p.pair} value={p.pair}>
              {languageFlag(p.source_language) ?? ""}{" "}
              {languageName(p.source_language)} →{" "}
              {languageFlag(p.target_language) ?? ""}{" "}
              {languageName(p.target_language)}
            </option>
          ))}
        </select>
        <label className="pack-toolbar-label" htmlFor="lab-absurdity">
          Absurdity
        </label>
        <select
          id="lab-absurdity"
          className="admin-input"
          value={absurdity}
          onChange={(e) => setAbsurdity(e.target.value)}
        >
          {ABSURDITIES.map((a) => (
            <option key={a} value={a}>
              {a} · {absurdityLabel(a)}
            </option>
          ))}
        </select>
      </div>
      {pairs && pairs.length === 0 && (
        <p className="admin-error">
          Could not load the pair list — is the server reachable?
        </p>
      )}

      <h3 className="lab-subhead">Configs</h3>
      {configsError && <p className="admin-error">{configsError}</p>}
      {!configs && !configsError && (
        <p className="admin-muted">Loading configs…</p>
      )}
      {configs && configs.length === 0 && (
        <p className="admin-muted">The server offers no lab configs.</p>
      )}
      {configs && configs.length > 0 && (
        <ul className="lab-config-list">
          {configs.map((c) => (
            <li key={c.key}>
              <label className="lab-config-row">
                <input
                  type="checkbox"
                  checked={checked.has(c.key)}
                  onChange={() => toggleConfig(c.key)}
                />
                <span className="lab-config-key">{c.key}</span>
                <span className="lab-config-meta">
                  {c.provider} · {c.model}
                  {Object.keys(c.params).length > 0 &&
                    ` · ${paramsSummary(c.params)}`}
                </span>
                {checked.has(c.key) && (
                  <PromptSelect
                    value={promptByKey[c.key] ?? PROD_PROMPT_REF}
                    onChange={(ref) => setPromptFor(c.key, ref)}
                    prompts={prompts}
                    ariaLabel={`Prompt for ${c.key}`}
                  />
                )}
                <span
                  className="lab-config-price"
                  title={`$${c.input_usd_per_mtok}/M in · $${c.output_usd_per_mtok}/M out`}
                >
                  {fmtUsd(c.unit_price_usd)}/card
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {configs && configs.length > 0 && (
        <div className="lab-extra-entries">
          {extras.map((ex, i) => (
            <div className="lab-tool-row" key={i}>
              <select
                className="admin-input lab-prompt-select"
                value={ex.key}
                onChange={(e) => updateExtra(i, { key: e.target.value })}
                aria-label={`Extra entry ${i + 1} config`}
              >
                {configs.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.key}
                  </option>
                ))}
              </select>
              <PromptSelect
                value={ex.promptRef}
                onChange={(ref) => updateExtra(i, { promptRef: ref })}
                prompts={prompts}
                ariaLabel={`Extra entry ${i + 1} prompt`}
              />
              <button
                className="admin-btn"
                onClick={() => removeExtra(i)}
                aria-label={`Remove extra entry ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button className="admin-btn" onClick={addExtra}>
            + Add row
          </button>
          <span className="admin-muted lab-extra-hint">
            Extra rows run a config again with a different prompt.
          </span>
        </div>
      )}

      <h3 className="lab-subhead">Words</h3>
      <div className="lab-words">
        <textarea
          className="admin-input lab-textarea"
          rows={8}
          placeholder={"One word per line…"}
          value={wordsText}
          onChange={(e) => setWordsText(e.target.value)}
          aria-label="Words to generate, one per line"
        />
        <div className="lab-word-tools">
          <div className="lab-tool-row">
            <label className="pack-toolbar-label" htmlFor="lab-count">
              Count
            </label>
            <input
              id="lab-count"
              className="admin-input pack-target-input"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isFinite(n)) {
                  setCount(Math.max(1, Math.min(50, Math.floor(n))));
                }
              }}
              aria-label="How many words to suggest or sample"
            />
          </div>
          <button
            className="admin-btn"
            onClick={() => void suggest()}
            disabled={suggesting || !pair}
          >
            {suggesting ? "Suggesting…" : "Suggest themed"}
          </button>
          <div className="lab-tool-row" aria-label="Corpus sample zipf bands">
            {SAMPLE_BANDS.map((b) => (
              <label key={b} className="lab-band">
                <input
                  type="checkbox"
                  checked={bands.has(b)}
                  onChange={() => toggleBand(b)}
                />
                {b}
              </label>
            ))}
          </div>
          <button
            className="admin-btn"
            onClick={() => void sample()}
            disabled={sampling || !pair || bands.size === 0}
          >
            {sampling ? "Sampling…" : "Sample corpus"}
          </button>
          {wordsText !== "" && (
            <button
              className="admin-btn"
              onClick={() => {
                setWordsText("");
                setScene(null);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {scene && (
        <p className="batch-scene">
          Scene: <strong dir="auto">{scene}</strong>
        </p>
      )}
      {wordsError && <p className="admin-error">{wordsError}</p>}

      <div className="lab-run-row">
        <span className="lab-cost">
          {words.length} word{words.length === 1 ? "" : "s"} ×{" "}
          {entries.length} config
          {entries.length === 1 ? "" : "s"} ≈{" "}
          <strong>{fmtUsd(projected)}</strong>
        </span>
        <button
          className="admin-btn primary"
          onClick={() => void run()}
          disabled={
            starting || !pair || words.length === 0 || entries.length === 0
          }
        >
          {starting ? "Starting…" : "Run batch"}
        </button>
      </div>
      {runError && <p className="admin-error">{runError}</p>}
    </section>
  );
}
