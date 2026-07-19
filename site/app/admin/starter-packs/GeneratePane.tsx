"use client";

// Sub-page 3: generate a fresh card (text + image) for a typed word and add it
// to the pack. The pair, target language, and add action come from the shared
// provider. The parent page remounts this on pair change (key={pair}), so the
// in-flight card and image poll reset with the pair.

import { useEffect, useRef, useState } from "react";
import AdminTile from "./AdminTile";
import { errorMessage, useStarterPack } from "./StarterPackContext";
import { languageName } from "@/lib/api";
import {
  generateAdminCard,
  isAdminStatus,
  pollAdminCardImage,
  type AdminCard,
} from "@/lib/admin";

export default function GeneratePane() {
  const { pair, selected, packIds, addCard } = useStarterPack();
  const targetLanguage = selected?.target_language ?? null;
  const [input, setInput] = useState("");
  const [card, setCard] = useState<AdminCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic token: bumping it cancels any in-flight image poll (re-roll,
  // pair switch unmount).
  const pollToken = useRef(0);

  useEffect(
    () => () => {
      pollToken.current++;
    },
    [],
  );

  // The generate response carries no image_url, so always fetch the card
  // detail once; keep polling every ~3 s while the illustration is 'pending'
  // ('none' = there won't be one, stop).
  async function pollImage(associationId: number) {
    const token = ++pollToken.current;
    setPolling(true);
    try {
      await pollAdminCardImage(
        associationId,
        setCard,
        () => pollToken.current !== token,
      );
    } catch (err) {
      if (pollToken.current === token) setError(errorMessage(err));
    } finally {
      if (pollToken.current === token) setPolling(false);
    }
  }

  async function generate(word: string, avoidAssociationId?: number) {
    const trimmed = word.trim();
    if (!trimmed || busy) return;
    pollToken.current++;
    setPolling(false);
    setBusy(true);
    setError(null);
    try {
      const generated = await generateAdminCard(
        trimmed,
        pair,
        avoidAssociationId,
      );
      setCard(generated);
      setBusy(false);
      await pollImage(generated.association_id);
    } catch (err) {
      setBusy(false);
      setError(
        isAdminStatus(err, 404)
          ? `“${trimmed}” is not a known word in this pair.`
          : errorMessage(err),
      );
    }
  }

  const target = targetLanguage
    ? languageName(targetLanguage)
    : "the target language";
  const inPack =
    card !== null && (packIds?.has(card.association_id) ?? false);
  const imagePending = card?.image_status === "pending";

  return (
    <section className="admin-pane">
      <h2>Generate</h2>
      <p className="admin-pane-hint">
        Generate a fresh card for a word. Keyword quality matters: prefer
        sound-alike hooks that are native {target} words over loanword
        transliterations of the source word (for en → ru, трость and Кресло
        were keepers; СЛИП and Миньон were rejects) — re-roll until the hook is
        a real word. Also watch for compositions repeating the same scene
        across the pack.
      </p>
      <form
        className="admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          void generate(input);
        }}
      >
        <input
          className="admin-input"
          type="text"
          placeholder="Word to generate…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Word to generate a card for"
        />
        <button
          className="admin-btn primary"
          type="submit"
          disabled={busy || !input.trim()}
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </form>
      {error && <p className="admin-error">{error}</p>}
      {card && (
        <div className="gen-result">
          <AdminTile card={card}>
            <button
              className="admin-btn primary"
              disabled={inPack || adding || imagePending || busy}
              onClick={async () => {
                setAdding(true);
                await addCard(card.association_id);
                setAdding(false);
              }}
            >
              {inPack ? "In pack" : adding ? "Adding…" : "Add to pack"}
            </button>
            <button
              className="admin-btn"
              disabled={busy}
              onClick={() => void generate(card.word, card.association_id)}
            >
              Re-roll
            </button>
          </AdminTile>
          {card.explanation && (
            <p className="admin-muted gen-status" dir="auto">
              {card.explanation}
            </p>
          )}
          {polling && (
            <p className="admin-muted gen-status">
              Illustration rendering — checking every few seconds…
            </p>
          )}
          {card.image_status === "none" && (
            <p className="admin-muted gen-status">
              This card has no illustration.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
