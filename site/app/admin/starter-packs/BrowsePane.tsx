"use client";

// Sub-page 2: browse & select. Search the pair's corpus by word and add
// associations to the pack. The pair and the add action come from the shared
// provider; membership marks derive from the loaded pack there. The parent
// page remounts this on pair change (key={pair}), so the local search state
// resets with the pair. Clicking a tile opens its entry in the admin Cards
// table (deep-linked via ?card=), where the full detail lives.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AdminTile from "./AdminTile";
import { errorMessage, useStarterPack } from "./StarterPackContext";
import {
  hideAdminCard,
  searchAdminCards,
  type AdminCardsPage,
} from "@/lib/admin";

export default function BrowsePane() {
  const router = useRouter();
  const { pair, packIds, addCard } = useStarterPack();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminCardsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  // Hide (VocabCards #390) is a heavy admin action, so it's a two-step inline
  // confirm: `confirmId` is the card showing Confirm/Cancel, `hidingId` the one
  // whose hide is in flight.
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [hidingId, setHidingId] = useState<number | null>(null);

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

  // Hide: the card is soft-retired + cascaded server-side (reversibly), so drop
  // it from the local browse view (and the count) rather than refetching.
  async function hide(associationId: number) {
    setHidingId(associationId);
    setError(null);
    try {
      await hideAdminCard(associationId, pair);
      setData((d) =>
        d
          ? {
              ...d,
              cards: d.cards.filter((c) => c.association_id !== associationId),
              total: Math.max(0, d.total - 1),
            }
          : d,
      );
      setConfirmId(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setHidingId(null);
    }
  }

  return (
    <section className="admin-pane">
      <h2>Browse &amp; select</h2>
      <p className="admin-pane-hint">
        Search the pair&rsquo;s corpus by word. Every association is listed
        separately, so alternative cards of the same word are individually
        selectable. Click a card to open it in Cards.
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
                onOpen={() =>
                  router.push(
                    `/admin/cards?card=${card.association_id}&word=${encodeURIComponent(card.word)}&pair=${encodeURIComponent(pair)}`,
                  )
                }
              >
                <button
                  className="admin-btn primary"
                  onClick={() => void add(card.association_id)}
                  disabled={
                    inPack || addingId !== null || hidingId !== null
                  }
                >
                  {inPack
                    ? "In pack"
                    : addingId === card.association_id
                      ? "Adding…"
                      : "Add to pack"}
                </button>
                {confirmId === card.association_id ? (
                  <>
                    <button
                      className="admin-btn danger"
                      onClick={() => void hide(card.association_id)}
                      disabled={hidingId !== null}
                    >
                      {hidingId === card.association_id
                        ? "Hiding…"
                        : "Confirm hide"}
                    </button>
                    <button
                      className="admin-btn"
                      onClick={() => setConfirmId(null)}
                      disabled={hidingId !== null}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="admin-btn danger"
                    onClick={() => setConfirmId(card.association_id)}
                    disabled={addingId !== null || hidingId !== null}
                    title="Hide this card — inappropriate or broken (reversible)"
                  >
                    Hide
                  </button>
                )}
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
