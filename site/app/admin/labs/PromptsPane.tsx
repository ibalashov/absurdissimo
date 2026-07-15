"use client";

// Prompt templates pane (VocabCards #427): the saved prompt variants offered
// by BatchSetup's per-config selectors. Append-only by design — saving always
// creates a new template and existing ones never change, so a run's stored
// "lab:<id>" ref forever means exactly the text that generated its cards.
// The prompts themselves are fetched by the page (BatchSetup and RunView need
// them too); this pane only renders the list and hosts the create flow.

import { useState } from "react";
import { formatDateTime } from "@/lib/api";
import {
  createLabPrompt,
  type LabProdPrompt,
  type LabPrompt,
} from "@/lib/admin";
import { errorMessage } from "./util";

const PLACEHOLDERS =
  "{target_language}, {length_instruction}, {absurdity_instruction}";

export default function PromptsPane({
  prompts,
  prod,
  loadError,
  onCreated,
}: {
  prompts: LabPrompt[] | null;
  prod: LabProdPrompt | null;
  loadError: string | null;
  onCreated: (prompt: LabPrompt) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function openEditor() {
    setName("");
    // Seeded from the live production prompt — variants start as tweaks.
    setBody(prod?.body ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createLabPrompt(name.trim(), body);
      onCreated(created);
      setEditing(false);
    } catch (err) {
      // Includes the server's 422 placeholder-validation detail verbatim.
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-pane">
      <h2>Prompt templates</h2>
      <p className="admin-pane-hint">
        Prompt variants for the config rows above. Saving creates a new
        template; existing ones never change, so a run&rsquo;s{" "}
        <code>lab:&lt;id&gt;</code> ref always means exactly the text it ran
        with.
      </p>

      {loadError && <p className="admin-error">{loadError}</p>}
      {!prompts && !loadError && (
        <p className="admin-muted">Loading templates…</p>
      )}

      {prod && (
        <details className="lab-prompt">
          <summary className="lab-prompt-summary">
            <span className="lab-chip">{prod.ref}</span>
            <span className="lab-prompt-name">
              Production prompt (v{prod.prompt_version})
            </span>
          </summary>
          <pre className="lab-prompt-body">{prod.body}</pre>
        </details>
      )}
      {(prompts ?? []).map((p) => (
        <details className="lab-prompt" key={p.id}>
          <summary className="lab-prompt-summary">
            <span className="lab-chip">lab:{p.id}</span>
            <span className="lab-prompt-name">{p.name}</span>
            <span className="lab-prompt-date">
              {formatDateTime(p.created_at)}
            </span>
          </summary>
          <pre className="lab-prompt-body">{p.body}</pre>
        </details>
      ))}
      {prompts && prompts.length === 0 && (
        <p className="admin-muted">No templates saved yet.</p>
      )}

      {!editing && (
        <button
          className="admin-btn lab-prompt-new"
          onClick={openEditor}
          disabled={!prod}
        >
          New template
        </button>
      )}
      {editing && (
        <div className="lab-prompt-form">
          <input
            className="admin-input"
            type="text"
            maxLength={80}
            placeholder="Template name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Template name"
          />
          <textarea
            className="admin-input lab-textarea lab-prompt-editor"
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Template body"
          />
          <p className="admin-pane-hint">
            Allowed placeholders: {PLACEHOLDERS} — anything else is rejected.
            The body is seeded from the production prompt.
          </p>
          <div className="lab-tool-row">
            <button
              className="admin-btn primary"
              onClick={() => void save()}
              disabled={saving || name.trim() === "" || body.trim() === ""}
            >
              {saving ? "Saving…" : "Save as new template"}
            </button>
            <button
              className="admin-btn"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
          {saveError && <p className="admin-error">{saveError}</p>}
        </div>
      )}
    </section>
  );
}
