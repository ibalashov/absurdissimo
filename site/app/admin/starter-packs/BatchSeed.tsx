"use client";

// Seed a pack with a themed batch (VocabCards #366). Available whether the pack
// is empty or already has cards — the admin can keep topping it up. The server
// invents one coherent, positive everyday scene and returns medium-hard,
// verb-leaning source words that populate it; each word is then generated into a
// card here (at "wild" = middle absurdity) and reviewed before it lands in the
// pack — same Add / Re-roll flow as the Generate sub-page, just fanned out over
// the batch.

import { useCallback, useEffect, useRef, useState } from "react";
import AdminTile from "./AdminTile";
import {
  IMAGE_POLL_MS,
  errorMessage,
  useStarterPack,
} from "./StarterPackContext";
import {
  fetchAdminCard,
  generateAdminCard,
  isAdminStatus,
  suggestStarterBatch,
  type AdminCard,
} from "@/lib/admin";

// The user asked for the middle of the five absurdity levels (sensible,
// quirky, wild, bizarre, unhinged).
const MIDDLE_ABSURDITY = "wild";

const BATCH_SIZE_KEY = "admin.starterBatchSize";
const DEFAULT_BATCH_SIZE = 6;

function clampBatchSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

// One word's card: generated on mount, image polled to 'ready', then offered
// for review with Add / Re-roll. A self-contained mirror of the Generate
// pane's single-card lifecycle (the pane keeps its typed-input concerns).
function BatchCard({ word }: { word: string }) {
  const { pair, packIds, addCard } = useStarterPack();
  const [card, setCard] = useState<AdminCard | null>(null);
  const [busy, setBusy] = useState(true); // generating on mount
  const [polling, setPolling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic token: bumping it cancels any in-flight image poll (re-roll or
  // unmount when the batch is cleared/regenerated).
  const pollToken = useRef(0);

  const pollImage = useCallback(async (associationId: number) => {
    const token = ++pollToken.current;
    setPolling(true);
    try {
      for (;;) {
        const fresh = await fetchAdminCard(associationId);
        if (pollToken.current !== token) return;
        setCard(fresh);
        if (fresh.image_status !== "pending") return;
        await new Promise((r) => setTimeout(r, IMAGE_POLL_MS));
        if (pollToken.current !== token) return;
      }
    } catch (err) {
      if (pollToken.current === token) setError(errorMessage(err));
    } finally {
      if (pollToken.current === token) setPolling(false);
    }
  }, []);

  const generate = useCallback(
    async (avoidAssociationId?: number) => {
      pollToken.current++;
      setPolling(false);
      setBusy(true);
      setError(null);
      try {
        const generated = await generateAdminCard(
          word,
          pair,
          avoidAssociationId,
          MIDDLE_ABSURDITY,
        );
        setCard(generated);
        setBusy(false);
        await pollImage(generated.association_id);
      } catch (err) {
        setBusy(false);
        setError(
          isAdminStatus(err, 404)
            ? `“${word}” is not a known word in this pair.`
            : errorMessage(err),
        );
      }
    },
    [word, pair, pollImage],
  );

  useEffect(() => {
    void generate();
    return () => {
      pollToken.current++; // cancel the poll if we unmount mid-flight
    };
  }, [generate]);

  const inPack = card !== null && (packIds?.has(card.association_id) ?? false);
  const imagePending = card?.image_status === "pending";

  if (busy && !card) {
    return (
      <div className="card admin-tile batch-card-loading">
        <span className="admin-tile-noimg">generating “{word}”…</span>
      </div>
    );
  }
  if (error && !card) {
    return (
      <div className="card admin-tile batch-card-loading">
        <span className="admin-tile-noimg">{error}</span>
        <button
          className="admin-btn"
          onClick={() => void generate()}
          disabled={busy}
        >
          Retry
        </button>
      </div>
    );
  }
  if (!card) return null;

  return (
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
        onClick={() => void generate(card.association_id)}
      >
        {busy ? "…" : "Re-roll"}
      </button>
    </AdminTile>
  );
}

export default function BatchSeed() {
  const { pair } = useStarterPack();
  const [batchSize, setBatchSizeState] = useState(DEFAULT_BATCH_SIZE);
  const [scene, setScene] = useState<string | null>(null);
  const [words, setWords] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore the saved batch size after mount (localStorage is client-only).
  useEffect(() => {
    const raw = localStorage.getItem(BATCH_SIZE_KEY);
    if (raw !== null) setBatchSizeState(clampBatchSize(Number(raw)));
  }, []);

  const setBatchSize = useCallback((n: number) => {
    const clamped = clampBatchSize(n);
    setBatchSizeState(clamped);
    try {
      localStorage.setItem(BATCH_SIZE_KEY, String(clamped));
    } catch {
      // Private-mode / storage-disabled: keep the in-memory value.
    }
  }, []);

  const hasBatch = words !== null;

  async function run() {
    setError(null);
    setLoading(true);
    try {
      const batch = await suggestStarterBatch(pair, batchSize);
      setScene(batch.scene);
      setWords(batch.words);
    } catch (err) {
      setError(errorMessage(err));
      setScene(null);
      setWords(null);
    } finally {
      setLoading(false);
    }
  }

  function done() {
    setScene(null);
    setWords(null);
    setError(null);
  }

  return (
    <section className="admin-pane batch-seed">
      <h2>Seed this pack</h2>
      <p className="admin-pane-hint">
        Generate a themed batch — medium-to-difficult verbs and the nouns that
        share one positive everyday scene, at a middle absurdity. Review each
        card and add the keepers; re-roll a weak keyword hook.
      </p>
      <div className="batch-controls">
        <label className="pack-toolbar-label" htmlFor="batch-size">
          Batch size
        </label>
        <input
          id="batch-size"
          className="admin-input pack-target-input"
          type="number"
          min={1}
          max={24}
          value={batchSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) setBatchSize(n);
          }}
          aria-label="Number of cards to generate per batch"
          disabled={loading}
        />
        <button
          className="admin-btn primary"
          onClick={() => void run()}
          disabled={loading || !pair}
        >
          {loading
            ? "Finding a scene…"
            : hasBatch
              ? "Generate another batch"
              : `Generate a batch of ${batchSize}`}
        </button>
        {(hasBatch || loading) && (
          <button className="admin-btn" onClick={done} disabled={loading}>
            Done
          </button>
        )}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {scene && (
        <p className="batch-scene">
          Scene: <strong dir="auto">{scene}</strong>
        </p>
      )}

      {words !== null && words.length === 0 && !loading && (
        <p className="admin-muted">
          The picker didn’t return any usable words this time — try again.
        </p>
      )}
      {words !== null && words.length > 0 && (
        <div className="tile-grid">
          {words.map((word, i) => (
            <BatchCard key={`${scene}-${word}-${i}`} word={word} />
          ))}
        </div>
      )}
    </section>
  );
}
