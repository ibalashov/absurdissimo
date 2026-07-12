"use client";

// Sub-page 2: browse & select. Search the pair's corpus by word and add
// associations to the pack. The pair and the add action come from the shared
// provider; membership marks derive from the loaded pack there. The parent
// page remounts this on pair change (key={pair}), so the local search state
// resets with the pair.

import { useEffect, useState } from "react";
import AdminTile from "./AdminTile";
import { errorMessage, useStarterPack } from "./StarterPackContext";
import { searchAdminCards, type AdminCardsPage } from "@/lib/admin";

export default function BrowsePane() {
  const { pair, packIds, addCard } = useStarterPack();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminCardsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    if (!pair) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchAdminCards(pair, q, page)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, q, page]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  async function add(associationId: number) {
    setAddingId(associationId);
    await addCard(associationId);
    setAddingId(null);
  }

  return (
    <section className="admin-pane">
      <h2>Browse &amp; select</h2>
      <p className="admin-pane-hint">
        Search the pair&rsquo;s corpus by word. Every association is listed
        separately, so alternative cards of the same word are individually
        selectable.
      </p>
      <form
        className="admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
          setPage(1);
        }}
      >
        <input
          className="admin-input"
          type="search"
          placeholder="Search by word…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Search corpus cards by word"
        />
        <button className="admin-btn" type="submit">
          Search
        </button>
      </form>
      {error && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-muted">Loading…</p>}
      {!loading && !error && data && data.cards.length === 0 && (
        <p className="admin-muted">
          {q ? `No cards match “${q}”.` : "No cards in this pair yet."}
        </p>
      )}
      {!loading && !error && data && data.cards.length > 0 && (
        <div className="tile-grid">
          {data.cards.map((card) => {
            const inPack = packIds
              ? packIds.has(card.association_id)
              : (card.in_starter_pack ?? false);
            return (
              <AdminTile
                key={card.association_id}
                card={card}
                corner={
                  inPack ? (
                    <span className="in-pack-badge">in pack ✓</span>
                  ) : undefined
                }
              >
                <button
                  className="admin-btn primary"
                  onClick={() => void add(card.association_id)}
                  disabled={inPack || addingId !== null}
                >
                  {inPack
                    ? "In pack"
                    : addingId === card.association_id
                      ? "Adding…"
                      : "Add to pack"}
                </button>
              </AdminTile>
            );
          })}
        </div>
      )}
      {data && totalPages > 1 && (
        <div className="admin-pager">
          <button
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            ← Prev
          </button>
          <span>
            Page {data.page} of {totalPages} · {data.total} cards
          </span>
          <button
            className="admin-btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || loading}
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
