"use client";

// By-word view (VocabCards #458): the inventory's group=word rollup — one row
// per (pair, word) with variant counts and spend. "View variants" scopes the
// shared word filter and jumps to the table, which lists that word's
// generations side by side.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, languageFlag } from "@/lib/api";
import { fetchCardWordGroups, type InventoryWordGroupPage } from "@/lib/admin";
import { errorMessage, fmtUsd, pairSlug } from "../util";
import { useCards } from "../CardsContext";

export default function CardsByWordPage() {
  const router = useRouter();
  const { apiFilters, filtersKey, setFilters } = useCards();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryWordGroupPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  useEffect(() => {
    let cancelled = false;
    fetchCardWordGroups(apiFilters, page).then(
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
  }, [filtersKey, page]);

  function openWord(group: { source_language: string; target_language: string; word: string }) {
    setFilters({
      word: group.word,
      pair: pairSlug(group.source_language, group.target_language),
    });
    router.push("/admin/cards");
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  return (
    <section className="admin-pane">
      {error && <p className="admin-error">{error}</p>}
      {!data && !error && <p className="admin-muted">Loading…</p>}
      {data && data.groups.length === 0 && (
        <p className="admin-muted">Nothing matches these filters.</p>
      )}

      {data && data.groups.length > 0 && (
        <div className="lab-table-scroll">
          <table className="lab-table">
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col">Word</th>
                <th scope="col" className="num">
                  Variants
                </th>
                <th scope="col" className="num">
                  Active
                </th>
                <th scope="col" className="num">
                  Total cost
                </th>
                <th scope="col">First</th>
                <th scope="col">Latest</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr
                  key={`${g.source_language}-${g.target_language}-${g.word}`}
                  className="lab-history-row"
                  onClick={() => openWord(g)}
                >
                  <td>
                    {languageFlag(g.source_language) ?? g.source_language} →{" "}
                    {languageFlag(g.target_language) ?? g.target_language}
                  </td>
                  <td>
                    <strong>{g.display_word}</strong>
                  </td>
                  <td className="num">{g.variant_count}</td>
                  <td className="num">{g.active_count}</td>
                  <td className="num">{fmtUsd(g.total_cost_usd)}</td>
                  <td>{formatDateTime(g.first_created_at)}</td>
                  <td>{formatDateTime(g.last_created_at)}</td>
                  <td>
                    <button
                      className="lab-run-link"
                      onClick={() => openWord(g)}
                    >
                      View variants →
                    </button>
                  </td>
                </tr>
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
