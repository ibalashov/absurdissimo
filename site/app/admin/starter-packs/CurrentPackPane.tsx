"use client";

// Sub-page 1: the current pack — ordered, with unselect and up/down reorder.
// State (the pack, move/remove, busy flags) comes from the shared provider, so
// edits here are reflected in the pack-size badge and in the membership marks
// on the browse/generate sub-pages.

import AdminTile from "./AdminTile";
import { useStarterPack } from "./StarterPackContext";

export default function CurrentPackPane() {
  const { pack, packError, packBusy, move, remove } = useStarterPack();

  return (
    <section className="admin-pane">
      <h2>Current pack</h2>
      <p className="admin-pane-hint">
        The order here is the order new users see the deck in. Move cards with
        the arrows; every move saves immediately.
      </p>
      {packError ? (
        <p className="admin-error">{packError}</p>
      ) : pack === null ? (
        <p className="admin-muted">Loading…</p>
      ) : pack.length === 0 ? (
        <p className="admin-muted">
          No cards in this pack yet — add some from Browse &amp; select or
          Generate.
        </p>
      ) : (
        <div className="tile-grid">
          {pack.map((card, i) => (
            <AdminTile
              key={card.association_id}
              card={card}
              corner={<span className="card-sub">#{i + 1}</span>}
            >
              <button
                className="admin-btn"
                onClick={() => void move(i, -1)}
                disabled={packBusy || i === 0}
                aria-label={`Move ${card.word} earlier`}
              >
                ↑
              </button>
              <button
                className="admin-btn"
                onClick={() => void move(i, 1)}
                disabled={packBusy || i === pack.length - 1}
                aria-label={`Move ${card.word} later`}
              >
                ↓
              </button>
              <button
                className="admin-btn danger"
                onClick={() => void remove(card.association_id)}
                disabled={packBusy}
                aria-label={`Remove ${card.word} from the pack`}
              >
                Remove
              </button>
            </AdminTile>
          ))}
        </div>
      )}
    </section>
  );
}
