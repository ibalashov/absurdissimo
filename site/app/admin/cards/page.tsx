"use client";

// The main Cards view (VocabCards #458): an xls-like table over
// GET /admin/cards/inventory — one row per generation, server-side
// sorting/filtering/pagination, a persisted column picker, and click-to-expand
// rows backed by the details endpoint.

import { useEffect, useMemo, useState } from "react";
import {
  fetchCardInventory,
  type InventoryPage,
  type InventoryRow,
  type InventorySortKey,
} from "@/lib/admin";
import { COLUMNS, DEFAULT_COLUMNS, type InventoryColumn } from "./columns";
import { errorMessage } from "./util";
import { useCards } from "./CardsContext";
import CardDetail from "./CardDetail";

const COLUMNS_KEY = "admin.cards.columns";
const PAGE_SIZE = 50;

function loadVisibleColumns(): string[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
      const known = new Set(COLUMNS.map((c) => c.key));
      const kept = parsed.filter((k) => known.has(k));
      if (kept.length > 0) return kept;
    }
  } catch {
    // Corrupt/unavailable storage — fall through to the defaults.
  }
  return DEFAULT_COLUMNS;
}

export default function CardsTablePage() {
  const { apiFilters, filtersKey } = useCards();
  const [sort, setSort] = useState<{ key: InventorySortKey; desc: boolean }>({
    key: "created_at",
    desc: true,
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visible, setVisible] = useState<string[]>(DEFAULT_COLUMNS);
  const [now, setNow] = useState(() => Date.now());
  // Bumped after a hide so the current page refetches.
  const [version, setVersion] = useState(0);

  // Column prefs are client-only state; hydrate them after mount.
  useEffect(() => {
    setVisible(loadVisibleColumns());
  }, []);

  const columns = useMemo(
    () => COLUMNS.filter((c) => visible.includes(c.key)),
    [visible],
  );

  // The live "Age" column ticks once a second — but only while it's shown.
  const ageVisible = visible.includes("age");
  useEffect(() => {
    if (!ageVisible) return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [ageVisible]);

  // Changed filters restart from page 1 and collapse the expansion.
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    fetchCardInventory(apiFilters, {
      sort: sort.key,
      order: sort.desc ? "desc" : "asc",
      page,
      pageSize: PAGE_SIZE,
    }).then(
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
    // filtersKey stands in for apiFilters (same object, stable string).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, sort, page, version]);

  function toggleSort(key: InventorySortKey) {
    setSort((prev) =>
      prev.key === key ? { key, desc: !prev.desc } : { key, desc: true },
    );
    setPage(1);
  }

  function toggleColumn(key: string) {
    setVisible((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...COLUMNS.map((c) => c.key).filter((k) => prev.includes(k) || k === key)];
      try {
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      } catch {
        // Private mode — keep the in-memory value.
      }
      return next;
    });
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  return (
    <section className="admin-pane">
      <div className="cards-table-tools">
        {data && (
          <span className="admin-muted">
            {data.total.toLocaleString("en-US")} generations
          </span>
        )}
        <details className="cards-column-picker">
          <summary className="admin-btn">Columns</summary>
          <div className="cards-column-menu">
            {COLUMNS.map((c) => (
              <label key={c.key}>
                <input
                  type="checkbox"
                  checked={visible.includes(c.key)}
                  onChange={() => toggleColumn(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!data && !error && <p className="admin-muted">Loading…</p>}
      {data && data.rows.length === 0 && (
        <p className="admin-muted">Nothing matches these filters.</p>
      )}

      {data && data.rows.length > 0 && (
        <div className="lab-table-scroll">
          <table className="lab-table cards-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.numeric ? "num" : undefined}>
                    {c.sortKey ? (
                      <button
                        className={`lab-sort-btn${sort.key === c.sortKey ? " active" : ""}`}
                        onClick={() => toggleSort(c.sortKey!)}
                      >
                        {c.label}
                        {sort.key === c.sortKey ? (sort.desc ? " ↓" : " ↑") : ""}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <RowPair
                  key={row.id}
                  row={row}
                  columns={columns}
                  now={now}
                  expanded={expandedId === row.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === row.id ? null : row.id))
                  }
                  onHidden={() => setVersion((v) => v + 1)}
                />
              ))}
            </tbody>
          </table>
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

function RowPair({
  row,
  columns,
  now,
  expanded,
  onToggle,
  onHidden,
}: {
  row: InventoryRow;
  columns: InventoryColumn[];
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onHidden: () => void;
}) {
  return (
    <>
      <tr
        className={`lab-history-row${expanded ? " active" : ""}`}
        onClick={(e) => {
          // Links/buttons inside cells keep their own behavior.
          if ((e.target as HTMLElement).closest("a,button,input,summary")) return;
          onToggle();
        }}
      >
        {columns.map((c) => (
          <td key={c.key} className={c.numeric ? "num" : undefined}>
            {c.render(row, { now })}
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className="cards-detail-row">
          <td colSpan={columns.length}>
            <CardDetail associationId={row.id} onHidden={onHidden} />
          </td>
        </tr>
      )}
    </>
  );
}
