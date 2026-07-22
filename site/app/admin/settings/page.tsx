"use client";

// Runtime settings (VocabCards #433/#434): change the live generation model,
// system prompt, prompt version, and default absurdity without a redeploy —
// they're compile-time constants server-side, overridable through
// GET/PATCH /admin/settings. One form; Save sends only the changed fields (a
// field set back to its default clears the override server-side). Each field
// shows whether it's currently an override and offers a reset to the
// compile-time default.
//
// Model tunables (VocabCards #460/#461): reasoning effort + temperature.
// Their default is unset (null) — resetting sends an explicit null. Which
// tunables apply is server-driven via model_tunables: a field the selected
// model doesn't support is greyed out, not hidden, and its stored value
// survives until a supporting model is picked again.

import { useEffect, useMemo, useState } from "react";
import {
  fetchRuntimeSettings,
  updateRuntimeSettings,
  type RuntimeSettings,
  type RuntimeSettingsResponse,
} from "@/lib/admin";

// Allowed placeholders in the system prompt — the server rejects anything else
// (and requires them all), so the card can't silently degrade.
const PLACEHOLDERS =
  "{target_language}, {length_instruction}, {absurdity_instruction}, {examples}";

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

  // Only the fields the admin actually changed, so the PATCH stays a partial
  // update (untouched fields keep their current state server-side).
  const changed = useMemo<Partial<RuntimeSettings>>(() => {
    if (!data || !form) return {};
    const diff: Partial<RuntimeSettings> = {};
    if (form.model !== data.effective.model) diff.model = form.model;
    if (form.system_prompt !== data.effective.system_prompt)
      diff.system_prompt = form.system_prompt;
    if (form.keyword_prompt !== data.effective.keyword_prompt)
      diff.keyword_prompt = form.keyword_prompt;
    if (form.scene_prompt !== data.effective.scene_prompt)
      diff.scene_prompt = form.scene_prompt;
    if (form.keyword_oversample !== data.effective.keyword_oversample)
      diff.keyword_oversample = form.keyword_oversample;
    if (form.prompt_version !== data.effective.prompt_version)
      diff.prompt_version = form.prompt_version;
    if (form.default_absurdity_level !== data.effective.default_absurdity_level)
      diff.default_absurdity_level = form.default_absurdity_level;
    // Tunables: null is a real value here (explicit null clears the override
    // server-side), so a set→unset change lands in the diff as null.
    if (form.reasoning_effort !== data.effective.reasoning_effort)
      diff.reasoning_effort = form.reasoning_effort;
    if (form.temperature !== data.effective.temperature)
      diff.temperature = form.temperature;
    return diff;
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

  const isOverridden = (field: keyof RuntimeSettings) =>
    data.overridden.includes(field);

  // A field row's "reset to default" sets the form value to the compile-time
  // default; saving then clears the override (value === default server-side).
  const resetField = (field: keyof RuntimeSettings) =>
    set(field, data.defaults[field]);

  const fieldStatus = (field: keyof RuntimeSettings) => (
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

  // Which tunables the model currently picked in the form supports — server-
  // driven, so a new model needs no UI change. An inapplicable field stays
  // visible but disabled; its stored value is kept, not cleared.
  const tunables = data.model_tunables[form.model] ?? [];
  const effortApplies = tunables.includes("reasoning_effort");
  const temperatureApplies = tunables.includes("temperature");

  return (
    <>
      <h1>Runtime settings</h1>
      <p className="admin-intro">
        Change how new cards are generated — live, without a redeploy. These
        override the compile-time defaults; served cards already in the corpus
        are unaffected unless you bump the prompt version.
      </p>

      <section className="admin-pane">
        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-model">
            Model
            {fieldStatus("model")}
          </label>
          <select
            id="setting-model"
            className="admin-input"
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
          >
            {data.model_options.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="admin-pane-hint">
            The text-generation model. Stamped on each card, so switching it
            does <strong>not</strong> bump the prompt version.
          </p>
        </div>

        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-effort">
            Reasoning effort
            {fieldStatus("reasoning_effort")}
          </label>
          <select
            id="setting-effort"
            className="admin-input"
            value={form.reasoning_effort ?? ""}
            disabled={!effortApplies}
            onChange={(e) =>
              set(
                "reasoning_effort",
                e.target.value === "" ? null : e.target.value,
              )
            }
          >
            <option value="">Unset (model default)</option>
            {data.reasoning_effort_options.map((o) => (
              <option key={o} value={o}>
                {titleCase(o)}
              </option>
            ))}
          </select>
          <p className="admin-pane-hint">
            {effortApplies ? (
              <>
                How much the model reasons before answering — more effort,
                slower and pricier generations. Unset keeps the model&rsquo;s
                built-in default.
              </>
            ) : (
              <>
                Not used by {form.model}. The stored value is kept and applies
                again when a supporting model is selected.
              </>
            )}
          </p>
        </div>

        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-temperature">
            Temperature
            {fieldStatus("temperature")}
          </label>
          <input
            id="setting-temperature"
            className="admin-input setting-temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature ?? ""}
            disabled={!temperatureApplies}
            onChange={(e) =>
              set(
                "temperature",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
          <p className="admin-pane-hint">
            {temperatureApplies ? (
              <>
                Sampling temperature, 0&ndash;2 — higher means more varied
                regenerations. Empty means unset: the provider&rsquo;s default
                applies.
              </>
            ) : (
              <>
                Not used by {form.model}. The stored value is kept and applies
                again when a supporting model is selected.
              </>
            )}
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
              set("prompt_version", Math.max(1, Number(e.target.value) || 1))
            }
          />
          <p className="admin-pane-hint">
            Bump this when you change the prompt so improved cards regenerate
            instead of serving stale ones.{" "}
            <strong>A bump cold-starts the whole corpus</strong> — every word
            regenerates on next lookup (LLM cost).
          </p>
        </div>

        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-prompt">
            One-shot fallback prompt
            {fieldStatus("system_prompt")}
          </label>
          <textarea
            id="setting-prompt"
            className="admin-input setting-prompt"
            rows={20}
            value={form.system_prompt}
            onChange={(e) => set("system_prompt", e.target.value)}
          />
          <p className="admin-pane-hint">
            Allowed placeholders: {PLACEHOLDERS} — all are required and anything
            else is rejected. Used only when the keyword and scene pipeline
            produces no surviving cards.
          </p>
        </div>

        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-keyword-prompt">
            Keyword prompt
            {fieldStatus("keyword_prompt")}
          </label>
          <textarea
            id="setting-keyword-prompt"
            className="admin-input setting-prompt"
            rows={20}
            value={form.keyword_prompt}
            onChange={(e) => set("keyword_prompt", e.target.value)}
          />
          <p className="admin-pane-hint">
            Template used to generate keyword candidates. Placeholders are
            validated by the server.
          </p>
        </div>

        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-scene-prompt">
            Scene prompt
            {fieldStatus("scene_prompt")}
          </label>
          <textarea
            id="setting-scene-prompt"
            className="admin-input setting-prompt"
            rows={20}
            value={form.scene_prompt}
            onChange={(e) => set("scene_prompt", e.target.value)}
          />
          <p className="admin-pane-hint">
            Template used to turn keyword candidates into mnemonic scenes.
            Placeholders are validated by the server.
          </p>
        </div>

        <div className="setting-field">
          <label className="setting-label" htmlFor="setting-keyword-oversample">
            Keyword oversample
            {fieldStatus("keyword_oversample")}
          </label>
          <input
            id="setting-keyword-oversample"
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
            Number of keyword candidates generated before filtering (1&ndash;25).
          </p>
        </div>

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
              {Object.keys(changed).length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {saveError && <p className="admin-error">{saveError}</p>}
        {notice && <p className="admin-notice">{notice}</p>}
      </section>
    </>
  );
}
