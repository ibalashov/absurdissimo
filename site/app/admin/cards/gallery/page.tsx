"use client";

// Gallery view (VocabCards #458): image-forward tile wall over the same
// filtered inventory, for fast visual scanning of bad images/keywords.
// Clicking a tile opens the shared detail panel above the grid.

import { useEffect, useState } from "react";
import { adminImageUrl, fetchCardInventory, type InventoryPage } from "@/lib/admin";
import CardImage from "@/components/CardImage";
import { errorMessage, fmtUsd } from "../util";
import { useCards } from "../CardsContext";
import CardDetail from "../CardDetail";

const PAGE_SIZE = 60;

export default function CardsGalleryPage() {
  const { apiFilters, filtersKey } = useCards();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    fetchCardInventory(apiFilters, { page, pageSize: PAGE_SIZE }).then(
      (fresh) => {
        if (cancelled) return;
        setData(fresh);
        setError(null);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page, version]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  return (
    <section className="admin-pane">
      {error && <p className="admin-error">{error}</p>}
      {!data && !error && <p className="admin-muted">Loading…</p>}
      {data && data.rows.length === 0 && (
        <p className="admin-muted">Nothing matches these filters.</p>
      )}

      {selectedId !== null && (
        <div className="cards-gallery-detail">
          <button
            className="admin-btn"
            type="button"
            onClick={() => setSelectedId(null)}
          >
            ✕ Close
          </button>
          <CardDetail
            associationId={selectedId}
            onHidden={() => setVersion((v) => v + 1)}
          />
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="cards-gallery">
          {data.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`cards-tile${row.id === selectedId ? " active" : ""}${
                row.status === "hidden" ? " hidden-card" : ""
              }`}
              onClick={() =>
                setSelectedId((prev) => (prev === row.id ? null : row.id))
              }
            >
              {/* The media box holds the square whether the image loads or
                  404s (CardImage renders null on error) — a collapsed tile
                  reflows the whole grid mid-scroll (#468). */}
              <div className="cards-tile-media">
                {row.image_url && row.image_status === "ready" ? (
                  <CardImage
                    className="cards-tile-image"
                    src={adminImageUrl(row.image_url)}
                    alt={row.display_word}
                  />
                ) : (
                  <div className="cards-tile-placeholder">{row.image_status}</div>
                )}
              </div>
              <div className="cards-tile-body">
                <strong>{row.display_word}</strong>
                {row.keyword && (
                  <span className="cards-tile-keyword">{row.keyword}</span>
                )}
                <span
                  className="cards-tile-meta admin-muted"
                  title="text + image cost"
                >
                  {row.model ?? "?"} · {fmtUsd(row.total_cost_usd)}
                  {row.status === "hidden" ? " · hidden" : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="admin-pager">
          <button
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ← Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            className="admin-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}
