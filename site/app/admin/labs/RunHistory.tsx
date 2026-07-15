"use client";

// Past runs (VocabCards #426): pageable list from GET /admin/labs/runs, with
// an optional filter to the currently selected pair. Clicking a row reopens
// that run in the results view above (same component the live run uses).

import { useEffect, useState } from "react";
import { formatDateTime, languageFlag, languageName } from "@/lib/api";
import { fetchLabRuns, type LabRunPage } from "@/lib/admin";
import { errorMessage, fmtUsd } from "./util";

export default function RunHistory({
  pair,
  version,
  activeRunId,
  onOpen,
}: {
  pair: string;
  version: number;
  activeRunId: number | null;
  onOpen: (runId: number) => void;
}) {
  const [pairOnly, setPairOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LabRunPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filterPair = pairOnly ? pair : "";

  // A changed filter restarts from page 1.
  useEffect(() => {
    setPage(1);
  }, [filterPair]);

  useEffect(() => {
    let cancelled = false;
    fetchLabRuns(filterPair || undefined, page).then(
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
  }, [filterPair, page, version]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  return (
    <section className="admin-pane">
      <h2>Run history</h2>
      <div className="lab-tool-row lab-history-controls">
        <label className="lab-band">
          <input
            type="checkbox"
            checked={pairOnly}
            onChange={(e) => setPairOnly(e.target.checked)}
            disabled={!pair}
          />
          only {pair || "the selected pair"}
        </label>
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!data && !error && <p className="admin-muted">Loading…</p>}
      {data && data.runs.length === 0 && (
        <p className="admin-muted">No runs yet.</p>
      )}
      {data && data.runs.length > 0 && (
        <div className="lab-table-scroll">
          <table className="lab-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Pair</th>
                <th scope="col">Absurdity</th>
                <th scope="col" className="num">
                  Words
                </th>
                <th scope="col" className="num">
                  Configs
                </th>
                <th scope="col" className="num">
                  Cost
                </th>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr
                  key={r.id}
                  className={`lab-history-row${
                    r.id === activeRunId ? " active" : ""
                  }`}
                  onClick={() => onOpen(r.id)}
                >
                  <td>
                    <button
                      className="lab-run-link"
                      onClick={() => onOpen(r.id)}
                    >
                      #{r.id}
                    </button>
                  </td>
                  <td>
                    {languageFlag(r.source_language) ?? ""}{" "}
                    {languageName(r.source_language)} →{" "}
                    {languageFlag(r.target_language) ?? ""}{" "}
                    {languageName(r.target_language)}
                  </td>
                  <td>{r.absurdity}</td>
                  <td className="num">{r.words?.length ?? 0}</td>
                  <td className="num">{r.configs?.length ?? 0}</td>
                  <td className="num">
                    {fmtUsd(r.actual_cost_usd ?? r.projected_cost_usd)}
                  </td>
                  <td>
                    <span className={`lab-status ${r.status}`}>{r.status}</span>
                  </td>
                  <td>{formatDateTime(r.created_at)}</td>
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
