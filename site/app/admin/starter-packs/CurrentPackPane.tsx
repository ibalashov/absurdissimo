"use client";

// Sub-page 1: the current pack — ordered, with unselect and drag-to-reorder.
// State (the pack, reorderPack/remove, busy flags) comes from the shared
// provider, so edits here are reflected in the pack-size badge and in the
// membership marks on the browse/generate sub-pages. Reordering is native
// HTML5 drag-and-drop (no library): drop a tile onto another and the whole
// new order is PUT to the server.

import { useState } from "react";
import AdminTile from "./AdminTile";
import { useStarterPack } from "./StarterPackContext";

export default function CurrentPackPane() {
  const { pack, packError, packBusy, reorderPack, remove } = useStarterPack();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop(target: number) {
    if (dragIndex !== null) void reorderPack(dragIndex, target);
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <section className="admin-pane">
      <h2>Current pack</h2>
      <p className="admin-pane-hint">
        The order here is the order new users see the deck in. Drag a card onto
        another to reorder; every move saves immediately.
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
              drag={{
                className: `pack-tile-drag${dragIndex === i ? " dragging" : ""}${
                  overIndex === i && dragIndex !== i ? " drop-target" : ""
                }`,
                draggable: !packBusy,
                onDragStart: (e) => {
                  setDragIndex(i);
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox needs a payload for the drag to initiate.
                  e.dataTransfer.setData("text/plain", String(i));
                },
                onDragOver: (e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIndex !== i) setOverIndex(i);
                },
                onDragLeave: () =>
                  setOverIndex((cur) => (cur === i ? null : cur)),
                onDrop: (e) => {
                  e.preventDefault();
                  handleDrop(i);
                },
                onDragEnd: () => {
                  setDragIndex(null);
                  setOverIndex(null);
                },
              }}
            >
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
