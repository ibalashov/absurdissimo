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
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  DEFAULT_WEIGHT,
  type InventoryColumn,
} from "./columns";
import { errorMessage } from "./util";
import { EMPTY_FILTERS, useCards } from "./CardsContext";
import CardDetail from "./CardDetail";

// Sticky column prefs (VocabCards #467). The stored shape is {visible, known}:
// `visible` is the admin's selection in display order (drag a header to
// re-arrange), `known` is the full column set that existed when it was saved —
// so a later release's new default columns join the view without resetting
// the selection (the earlier approach bumped this key per column addition,
// trading the curated selection away every time). Bare-array payloads from
// the pre-#467 shape are honored as-is.
const COLUMNS_KEY = "admin.cards.columns.v2";
const PAGE_SIZE_KEY = "admin.cards.pageSize";
// Server caps page_size at 200.
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

function loadPageSize(): number {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_KEY));
    if (PAGE_SIZES.includes(stored)) return stored;
  } catch {
    // Corrupt/unavailable storage — fall through to the default.
  }
  return DEFAULT_PAGE_SIZE;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((k) => typeof k === "string");
}

function loadVisibleColumns(): string[] {
  const current = new Set(COLUMNS.map((c) => c.key));
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (isStringArray(parsed)) {
      // Legacy pre-#467 shape: the selection alone. Keep it verbatim; the
      // next toggle/re-arrange rewrites it in the {visible, known} shape.
      const kept = parsed.filter((k) => current.has(k));
      if (kept.length > 0) return kept;
    } else if (typeof parsed === "object" && parsed !== null) {
      const { visible, known } = parsed as { visible?: unknown; known?: unknown };
      if (isStringArray(visible) && isStringArray(known)) {
        const savedKnown = new Set(known);
        const kept = visible.filter((k) => current.has(k));
        // Default columns shipped after this selection was saved append at
        // the end — new telemetry surfaces without resetting the selection.
        const fresh = COLUMNS.filter(
          (c) => c.defaultVisible && !savedKnown.has(c.key) && !kept.includes(c.key),
        ).map((c) => c.key);
        if (kept.length + fresh.length > 0) return [...kept, ...fresh];
      }
    }
  } catch {
    // Corrupt/unavailable storage — fall through to the defaults.
  }
  return DEFAULT_COLUMNS;
}

function saveColumns(visible: string[]) {
  try {
    localStorage.setItem(
      COLUMNS_KEY,
      JSON.stringify({ visible, known: COLUMNS.map((c) => c.key) }),
    );
  } catch {
    // Private mode — keep the in-memory value.
  }
}

export default function CardsTablePage() {
  const { apiFilters, filtersKey, setFilters } = useCards();
  const [sort, setSort] = useState<{ key: InventorySortKey; desc: boolean }>({
    key: "created_at",
    desc: true,
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visible, setVisible] = useState<string[]>(DEFAULT_COLUMNS);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [now, setNow] = useState(() => Date.now());
  // Bumped after a hide so the current page refetches.
  const [version, setVersion] = useState(0);

  // Column and page-size prefs are client-only state; hydrate after mount.
  useEffect(() => {
    setVisible(loadVisibleColumns());
    setPageSize(loadPageSize());
  }, []);

  // Deep link into a specific generation (?card=<id>&word=<w>&pair=<p>),
  // used by the starter-pack browse tiles: replace the filters with the
  // card's word+pair so its variants are the whole table, then expand the
  // linked row once a data page containing it arrives.
  const [pendingCard, setPendingCard] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("card"));
    if (!Number.isInteger(id) || id <= 0) return;
    setFilters({
      ...EMPTY_FILTERS,
      word: params.get("word") ?? "",
      pair: params.get("pair") ?? "",
    });
    setPendingCard(id);
  }, [setFilters]);

  useEffect(() => {
    if (pendingCard === null || !data) return;
    if (data.rows.some((r) => r.id === pendingCard)) {
      setExpandedId(pendingCard);
      setPendingCard(null);
    }
  }, [data, pendingCard]);

  // Rendered in the admin's own order — `visible` is ordered, not a set.
  const columns = useMemo(
    () =>
      visible
        .map((key) => COLUMNS.find((c) => c.key === key))
        .filter((c): c is InventoryColumn => c !== undefined),
    [visible],
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Under the table's fixed layout, column widths come from this normalized
  // <colgroup>: each visible column's weight as a share of the visible total,
  // so widths always sum to 100% and the table fills the viewport exactly —
  // no horizontal overflow whatever subset the picker has on.
  const colWidths = useMemo(() => {
    const total =
      columns.reduce((s, c) => s + (c.weight ?? DEFAULT_WEIGHT), 0) || 1;
    return columns.map(
      (c) => `${(((c.weight ?? DEFAULT_WEIGHT) / total) * 100).toFixed(4)}%`,
    );
  }, [columns]);

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
      pageSize,
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
  }, [filtersKey, sort, page, pageSize, version]);

  function toggleSort(key: InventorySortKey) {
    setSort((prev) =>
      prev.key === key ? { key, desc: !prev.desc } : { key, desc: true },
    );
    setPage(1);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
    setExpandedId(null);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(size));
    } catch {
      // Private mode — keep the in-memory value.
    }
  }

  function toggleColumn(key: string) {
    setVisible((prev) => {
      let next: string[];
      if (prev.includes(key)) {
        next = prev.filter((k) => k !== key);
      } else {
        // Insert after the last visible column that canonically precedes it,
        // so a re-enabled column lands in a familiar spot even after the
        // table has been re-arranged.
        const canon = COLUMNS.map((c) => c.key);
        const at = prev.reduce(
          (acc, k, i) => (canon.indexOf(k) < canon.indexOf(key) ? i + 1 : acc),
          0,
        );
        next = [...prev.slice(0, at), key, ...prev.slice(at)];
      }
      saveColumns(next);
      return next;
    });
  }

  // Header drag-and-drop re-ordering (#467): drop the dragged column at the
  // target's position. Order persists with the selection.
  function moveColumn(fromKey: string, toKey: string) {
    setVisible((prev) => {
      const from = prev.indexOf(fromKey);
      const to = prev.indexOf(toKey);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      next.splice(to, 0, ...next.splice(from, 1));
      saveColumns(next);
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
        <label className="cards-page-size admin-muted">
          per page
          <select
            className="admin-input"
            value={pageSize}
            onChange={(e) => changePageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
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
            <colgroup>
              {columns.map((c, i) => (
                <col key={c.key} style={{ width: colWidths[i] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    title="Drag to re-arrange"
                    draggable
                    onDragStart={(e) => {
                      setDragKey(c.key);
                      e.dataTransfer.effectAllowed = "move";
                      // WebKit won't start a drag without payload data.
                      e.dataTransfer.setData("text/plain", c.key);
                    }}
                    onDragOver={(e) => {
                      if (dragKey && dragKey !== c.key) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverKey !== c.key) setDragOverKey(c.key);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragKey) moveColumn(dragKey, c.key);
                      setDragKey(null);
                      setDragOverKey(null);
                    }}
                    onDragEnd={() => {
                      setDragKey(null);
                      setDragOverKey(null);
                    }}
                    className={
                      [
                        c.numeric ? "num" : "",
                        "cards-th-drag",
                        dragKey === c.key ? "dragging" : "",
                        dragOverKey === c.key && dragKey !== c.key
                          ? "drop-target"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  >
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
