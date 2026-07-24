"use client";

// Runtime settings (VocabCards #433/#434): change the live generation model,
// system prompt, prompt version, and default absurdity without a redeploy —
// they're compile-time constants server-side, overridable through
// GET/PUT /admin/settings. Save sends only the changed fields (a field set
// back to its default clears the override server-side). Each field shows
// whether it's currently an override and offers a reset to the compile-time
// default.
//
// Model tunables (VocabCards #460/#461): reasoning effort + temperature.
// Their default is unset (null) — resetting sends an explicit null. Which
// tunables apply is server-driven via model_tunables: a field the selected
// model doesn't support is greyed out, not hidden, and its stored value
// survives until a supporting model is picked again.
//
// Per-span settings (VocabCards #615): a lookup spends several distinct LLM
// calls, and each gets its own tab holding its model/effort/temperature plus
// its prompt. The three association spans layer over the General tab's global
// model/effort/temperature — "Inherit" (null) is their default. Word info and
// image inherit nothing: separate provider surfaces with their own defaults.
// One form across all tabs: Save sends every change at once, and a tab with
// unsaved edits carries a dot.

import { useEffect, useMemo, useState } from "react";
import {
  fetchRuntimeSettings,
  updateRuntimeSettings,
  type RuntimeSettingField,
  type RuntimeSettings,
  type RuntimeSettingsResponse,
} from "@/lib/admin";

// Allowed placeholders per prompt — the server rejects anything else (and
// requires them all), so a card can't silently degrade.
const PLACEHOLDERS =
  "{target_language}, {length_instruction}, {absurdity_instruction}, {examples}";
const IMAGE_PLACEHOLDERS = "{word}, {mnemonic}, {explanation}";

type TabId = "general" | "word_info" | "keyword" | "scene" | "oneshot" | "image";

// Which fields live on which tab — drives the per-tab unsaved-changes dot, so
// a new field needs one entry here.
const TAB_FIELDS: Record<TabId, RuntimeSettingField[]> = {
  general: [
    "model",
    "reasoning_effort",
    "temperature",
    "default_absurdity_level",
    "prompt_version",
    "fast_path_on_miss",
  ],
  word_info: ["word_info_model", "word_info_reasoning_effort"],
  keyword: [
    "keyword_model",
    "keyword_reasoning_effort",
    "keyword_temperature",
    "keyword_oversample",
    "keyword_prompt",
  ],
  scene: [
    "scene_model",
    "scene_reasoning_effort",
    "scene_temperature",
    "scene_prompt",
  ],
  oneshot: [
    "oneshot_model",
    "oneshot_reasoning_effort",
    "oneshot_temperature",
    "system_prompt",
  ],
  image: ["image_model", "image_quality", "image_prompt"],
};

// Tab order = pipeline order: word info, then keyword, then scene, with the
// fallback and the illustration last.
const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "word_info", label: "Word info" },
  { id: "keyword", label: "Keyword" },
  { id: "scene", label: "Scene" },
  { id: "oneshot", label: "One-shot fallback" },
  { id: "image", label: "Image" },
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SettingsPage() {
  const [data, setData] = useState<RuntimeSettingsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeSettings | null>(null);
  const [tab, setTab] = useState<TabId>("general");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load once; seed the form from the effective (currently-live) values.
  useEffect(() => {
    let cancelled = false;
    fetchRuntimeSettings().then(
      (fresh) => {
        if (cancelled) return;
        setData(fresh);
        setForm(fresh.effective);
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Only the fields the admin actually changed, so the PUT stays a partial
  // update (untouched fields keep their current state server-side). Field-name
  // driven rather than hand-listed: every setting is a flat key, and null is a
  // real value here (an explicit null clears the override server-side), so a
  // set→inherit change lands in the diff as null.
  const changed = useMemo<Partial<RuntimeSettings>>(() => {
    if (!data || !form) return {};
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(form) as RuntimeSettingField[]) {
      if (form[key] !== data.effective[key]) diff[key] = form[key];
    }
    return diff as Partial<RuntimeSettings>;
  }, [data, form]);

  const dirty = Object.keys(changed).length > 0;

  function set<K extends keyof RuntimeSettings>(
    key: K,
    value: RuntimeSettings[K],
  ) {
    setForm((cur) => (cur ? { ...cur, [key]: value } : cur));
    setNotice(null);
  }

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const fresh = await updateRuntimeSettings(changed);
      setData(fresh);
      setForm(fresh.effective);
      setNotice("Saved. New generations use these settings immediately.");
    } catch (err) {
      // Surfaces the server's 422 validation detail (unknown model, bad
      // prompt placeholders) verbatim.
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadError)
    return (
      <>
        <h1>Runtime settings</h1>
        <p className="admin-error">{loadError}</p>
      </>
    );
  if (!data || !form)
    return (
      <>
        <h1>Runtime settings</h1>
        <p className="admin-muted">Loading settings…</p>
      </>
    );

  const isOverridden = (field: RuntimeSettingField) =>
    data.overridden.includes(field);

  // A field row's "reset to default" sets the form value to the compile-time
  // default; saving then clears the override (value === default server-side).
  // For a span field that default is null, i.e. back to inheriting the global.
  const resetField = (field: RuntimeSettingField) =>
    set(field, data.defaults[field]);

  const fieldStatus = (field: RuntimeSettingField) => (
    <span className="setting-status">
      {isOverridden(field) ? (
        <span className="setting-badge">Overridden</span>
      ) : (
        <span className="setting-badge default">Default</span>
      )}
      {form[field] !== data.defaults[field] && (
        <button
          type="button"
          className="setting-reset"
          onClick={() => resetField(field)}
        >
          Reset to default
        </button>
      )}
    </span>
  );

  // Which tunables a model supports — server-driven, so a new model needs no
  // UI change. An inapplicable field stays visible but disabled; its stored
  // value is kept, not cleared.
  const supports = (model: string, tunable: string) =>
    (data.model_tunables[model] ?? []).includes(tunable);

  const tabDirty = (id: TabId) =>
    TAB_FIELDS[id].some((field) => field in changed);

  // --- shared field renderers -------------------------------------------

  const modelField = (
    field: RuntimeSettingField,
    options: string[],
    hint: React.ReactNode,
    inheritLabel?: string,
  ) => (
    <div className="setting-field" key={field}>
      <label className="setting-label" htmlFor={`setting-${field}`}>
        Model
        {fieldStatus(field)}
      </label>
      <select
        id={`setting-${field}`}
        className="admin-input"
        value={(form[field] as string | null) ?? ""}
        onChange={(e) =>
          set(
            field,
            (e.target.value === "" && inheritLabel
              ? null
              : e.target.value) as never,
          )
        }
      >
        {inheritLabel && <option value="">{inheritLabel}</option>}
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <p className="admin-pane-hint">{hint}</p>
    </div>
  );

  const effortField = (
    field: RuntimeSettingField,
    model: string,
    emptyLabel: string,
  ) => {
    const applies = supports(model, "reasoning_effort");
    return (
      <div className="setting-field" key={field}>
        <label className="setting-label" htmlFor={`setting-${field}`}>
          Reasoning effort
          {fieldStatus(field)}
        </label>
        <select
          id={`setting-${field}`}
          className="admin-input"
          value={(form[field] as string | null) ?? ""}
          disabled={!applies}
          onChange={(e) =>
            set(field, (e.target.value === "" ? null : e.target.value) as never)
          }
        >
          <option value="">{emptyLabel}</option>
          {data.reasoning_effort_options.map((o) => (
            <option key={o} value={o}>
              {titleCase(o)}
            </option>
          ))}
        </select>
        <p className="admin-pane-hint">
          {applies ? (
            <>
              How much the model reasons before answering — more effort, slower
              and pricier generations.
            </>
          ) : (
            <>
              Not used by {model}. The stored value is kept and applies again
              when a supporting model is selected.
            </>
          )}
        </p>
      </div>
    );
  };

  const temperatureField = (
    field: RuntimeSettingField,
    model: string,
    emptyLabel: string,
    // The number input is narrow, so it gets the short form of emptyLabel as
    // its placeholder and spells the meaning out in the hint below.
    placeholder: string,
  ) => {
    const applies = supports(model, "temperature");
    return (
      <div className="setting-field" key={field}>
        <label className="setting-label" htmlFor={`setting-${field}`}>
          Temperature
          {fieldStatus(field)}
        </label>
        <input
          id={`setting-${field}`}
          className="admin-input setting-temperature"
          type="number"
          min={0}
          max={2}
          step={0.1}
          placeholder={placeholder}
          value={(form[field] as number | null) ?? ""}
          disabled={!applies}
          onChange={(e) =>
            set(
              field,
              (e.target.value === "" ? null : Number(e.target.value)) as never,
            )
          }
        />
        <p className="admin-pane-hint">
          {applies ? (
            <>
              Sampling temperature, 0&ndash;2 — higher means more varied
              regenerations. Empty means {emptyLabel.toLowerCase()}.
            </>
          ) : (
            <>
              Not used by {model}. The stored value is kept and applies again
              when a supporting model is selected.
            </>
          )}
        </p>
      </div>
    );
  };

  const promptField = (
    field: RuntimeSettingField,
    label: string,
    hint: React.ReactNode,
  ) => (
    <div className="setting-field" key={field}>
      <label className="setting-label" htmlFor={`setting-${field}`}>
        {label}
        {fieldStatus(field)}
      </label>
      <textarea
        id={`setting-${field}`}
        className="admin-input setting-prompt"
        rows={20}
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value as never)}
      />
      <p className="admin-pane-hint">{hint}</p>
    </div>
  );

  // One association span's three override rows. The effective model — the
  // span's own pick, else the global — decides which tunables apply.
  const spanFields = (
    modelKey: RuntimeSettingField,
    effortKey: RuntimeSettingField,
    temperatureKey: RuntimeSettingField,
  ) => {
    const effective = (form[modelKey] as string | null) ?? form.model;
    return (
      <>
        {modelField(
          modelKey,
          data.model_options,
          <>
            The model this call runs on. <strong>Inherit</strong> follows the
            General tab ({form.model}), so one switch there still moves every
            span that hasn&rsquo;t been pinned.
          </>,
          `Inherit from General (${form.model})`,
        )}
        {effortField(effortKey, effective, "Inherit from General")}
        {temperatureField(
          temperatureKey,
          effective,
          "Inherit from General",
          "Inherit",
        )}
      </>
    );
  };

  return (
    <>
      <h1>Runtime settings</h1>
      <p className="admin-intro">
        Change how new cards are generated — live, without a redeploy. These
        override the compile-time defaults; served cards already in the corpus
        are unaffected unless you bump the prompt version. Each LLM call the
        pipeline makes has its own tab; the association calls fall back to
        General for anything they don&rsquo;t pin.
      </p>

      <nav className="setting-tabs" aria-label="Settings groups">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`setting-tab${t.id === tab ? " active" : ""}`}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {tabDirty(t.id) && (
              <span className="setting-tab-dot" aria-label="unsaved changes" />
            )}
          </button>
        ))}
      </nav>

      <section className="admin-pane">
        {tab === "general" && (
          <>
            {modelField(
              "model",
              data.model_options,
              <>
                The default text-generation model, used by every association
                call that doesn&rsquo;t pin its own. Stamped on each card, so
                switching it does <strong>not</strong> bump the prompt version.
              </>,
            )}
            {effortField("reasoning_effort", form.model, "Unset (model default)")}
            {temperatureField(
              "temperature",
              form.model,
              "Unset (provider default)",
              "Unset",
            )}

            <div className="setting-field">
              <label
                className="setting-label"
                htmlFor="setting-fast-path-on-miss"
              >
                Fast path on keyword-store miss
                {fieldStatus("fast_path_on_miss")}
              </label>
              <input
                id="setting-fast-path-on-miss"
                className="setting-checkbox"
                type="checkbox"
                checked={form.fast_path_on_miss}
                onChange={(e) =>
                  set("fast_path_on_miss", e.target.checked)
                }
              />
              <p className="admin-pane-hint">
                Serve a one-shot card immediately when no stored keywords are
                usable, and propose keywords in the background. Off: run the
                keyword and scene calls inline (slower, higher quality
                selection).
              </p>
            </div>

            <div className="setting-field">
              <label className="setting-label" htmlFor="setting-absurdity">
                Default absurdity level
                {fieldStatus("default_absurdity_level")}
              </label>
              <select
                id="setting-absurdity"
                className="admin-input"
                value={form.default_absurdity_level}
                onChange={(e) => set("default_absurdity_level", e.target.value)}
              >
                {data.absurdity_options.map((a) => (
                  <option key={a} value={a}>
                    {titleCase(a)}
                  </option>
                ))}
              </select>
              <p className="admin-pane-hint">
                Used when a lookup doesn&rsquo;t specify a level. The app always
                sends its own, so this is the fallback for other callers.
              </p>
            </div>

            <div className="setting-field">
              <label className="setting-label" htmlFor="setting-version">
                Prompt version
                {fieldStatus("prompt_version")}
              </label>
              <input
                id="setting-version"
                className="admin-input setting-version"
                type="number"
                min={1}
                value={form.prompt_version}
                onChange={(e) =>
                  set(
                    "prompt_version",
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
              />
              <p className="admin-pane-hint">
                Bump this when you change a prompt so improved cards regenerate
                instead of serving stale ones.{" "}
                <strong>A bump cold-starts the whole corpus</strong> — every
                word regenerates on next lookup (LLM cost).
              </p>
            </div>
          </>
        )}

        {tab === "word_info" && (
          <>
            <p className="admin-pane-hint setting-tab-intro">
              The first call of a lookup: meaning, part of speech, IPA
              transcription and emoji for the word. Its result is stored in
              word_info.db and reused by every later card for that word, so it
              runs only for words the seeded store doesn&rsquo;t cover. It
              inherits nothing from General — it talks to OpenAI directly, and
              its prompt is versioned in code.
            </p>
            {modelField(
              "word_info_model",
              data.word_info_model_options,
              <>
                OpenAI models only — this call uses the OpenAI SDK directly. The
                effective model is stamped on each row written to word_info.db.
              </>,
            )}
            {effortField(
              "word_info_reasoning_effort",
              form.word_info_model,
              "Unset (model default)",
            )}
          </>
        )}

        {tab === "keyword" && (
          <>
            <p className="admin-pane-hint setting-tab-intro">
              Proposes sound-alike candidates for the word, filtered server-side
              and cached in the keyword store — so it runs only on a store miss.
              The quality bottleneck of the pipeline.
            </p>
            {spanFields(
              "keyword_model",
              "keyword_reasoning_effort",
              "keyword_temperature",
            )}
            <div className="setting-field">
              <label
                className="setting-label"
                htmlFor="setting-keyword_oversample"
              >
                Keyword oversample
                {fieldStatus("keyword_oversample")}
              </label>
              <input
                id="setting-keyword_oversample"
                className="admin-input setting-version"
                type="number"
                min={1}
                max={25}
                value={form.keyword_oversample}
                onChange={(e) =>
                  set(
                    "keyword_oversample",
                    Math.min(25, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
              />
              <p className="admin-pane-hint">
                Number of keyword candidates generated before filtering
                (1&ndash;25).
              </p>
            </div>
            {promptField(
              "keyword_prompt",
              "Keyword prompt",
              <>
                Template used to generate keyword candidates. Placeholders are
                validated by the server.
              </>,
            )}
          </>
        )}

        {tab === "scene" && (
          <>
            <p className="admin-pane-hint setting-tab-intro">
              Turns the validated candidates into the mnemonic scene. This is
              the call that writes the card, so its model is what gets stamped
              on it — and the user is waiting for it, so latency counts.
            </p>
            {spanFields(
              "scene_model",
              "scene_reasoning_effort",
              "scene_temperature",
            )}
            {promptField(
              "scene_prompt",
              "Scene prompt",
              <>
                Template used to turn keyword candidates into mnemonic scenes.
                Placeholders are validated by the server.
              </>,
            )}
          </>
        )}

        {tab === "oneshot" && (
          <>
            <p className="admin-pane-hint setting-tab-intro">
              The fallback: one call that picks a keyword and writes the scene
              together. Used only when the keyword step leaves no usable
              candidate.
            </p>
            {spanFields(
              "oneshot_model",
              "oneshot_reasoning_effort",
              "oneshot_temperature",
            )}
            {promptField(
              "system_prompt",
              "One-shot fallback prompt",
              <>
                Allowed placeholders: {PLACEHOLDERS} — all are required and
                anything else is rejected.
              </>,
            )}
          </>
        )}

        {tab === "image" && (
          <>
            <p className="admin-pane-hint setting-tab-intro">
              Renders the card illustration. Changing these affects{" "}
              <strong>new renders only</strong>: image settings are deliberately
              not part of the image cache key, so a switch neither orphans nor
              re-renders the images already in the corpus.
            </p>
            {modelField(
              "image_model",
              data.image_model_options,
              <>The image model each new card illustration is rendered with.</>,
            )}
            <div className="setting-field">
              <label className="setting-label" htmlFor="setting-image_quality">
                Quality
                {fieldStatus("image_quality")}
              </label>
              <select
                id="setting-image_quality"
                className="admin-input"
                value={form.image_quality}
                onChange={(e) => set("image_quality", e.target.value)}
              >
                {data.image_quality_options.map((q) => (
                  <option key={q} value={q}>
                    {titleCase(q)}
                  </option>
                ))}
              </select>
              <p className="admin-pane-hint">
                Render quality — the main cost driver per image, several times
                the price of <code>low</code> at the higher tiers.
              </p>
            </div>
            {promptField(
              "image_prompt",
              "Image prompt",
              <>
                Allowed placeholders: {IMAGE_PLACEHOLDERS} — all are required
                and anything else is rejected.
              </>,
            )}
          </>
        )}

        <div className="setting-actions">
          <button
            className="admin-btn primary"
            onClick={() => void save()}
            disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && !saving && (
            <span className="admin-muted">
              {Object.keys(changed).length} unsaved change
              {Object.keys(changed).length === 1 ? "" : "s"} across all tabs
            </span>
          )}
        </div>
        {saveError && <p className="admin-error">{saveError}</p>}
        {notice && <p className="admin-notice">{notice}</p>}
      </section>
    </>
  );
}
