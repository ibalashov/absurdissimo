"use client";

import { useEffect, useState } from "react";
import {
  fetchWordInfoRows,
  fetchWordInfoStatus,
  type WordInfoRowsResponse,
  type WordInfoStatusPair,
  type WordInfoStatusResponse,
} from "@/lib/admin";

const PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function statusFor(
  row: WordInfoStatusPair,
  currentPromptVersion: number,
): "OK" | "STALE" | "NONE" {
  if (row.seeded_rows === 0) return "NONE";
  const expected = String(currentPromptVersion);
  return row.seeded_prompt_versions.length === 1 &&
    row.seeded_prompt_versions[0] === expected
    ? "OK"
    : "STALE";
}

function versions(values: string[]): string {
  return values.length > 0 ? values.map((value) => `v${value}`).join(", ") : "—";
}

export default function WordInfoPage() {
  const [data, setData] = useState<WordInfoStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pair, setPair] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "seeded" | "live">("all");
  const [suspect, setSuspect] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WordInfoRowsResponse | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWordInfoStatus().then(
      (fresh) => {
        if (cancelled) return;
        setData(fresh);
        setPair(
          fresh.pairs.find((candidate) => candidate.seeded_rows > 0)?.pair ??
            fresh.pairs[0]?.pair ??
            "",
        );
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (qDraft === q) return;
    const handle = setTimeout(() => {
      setQ(qDraft);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [qDraft, q]);

  useEffect(() => {
    if (!pair) return;
    let cancelled = false;
    setRowsLoading(true);
    setRowsError(null);
    fetchWordInfoRows({
      pair,
      q,
      status,
      suspect,
      page,
      page_size: PAGE_SIZE,
    })
      .then((fresh) => {
        if (!cancelled) setRows(fresh);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRowsError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setRowsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, q, status, suspect, page]);

  if (loadError)
    return (
      <>
        <h1>Word info</h1>
        <p className="admin-error">{loadError}</p>
      </>
    );

  if (!data)
    return (
      <>
        <h1>Word info</h1>
        <p className="admin-muted">Loading word info status…</p>
      </>
    );

  const totalPages = rows
    ? Math.max(1, Math.ceil(rows.total / rows.page_size))
    : 1;

  function changeFilter(change: () => void) {
    change();
    setPage(1);
  }

  return (
    <>
      <h1>Word info</h1>
      <p className="word-info-contract">
        Current contract: v{data.current_prompt_version} · {data.current_model}
      </p>

      {data.pairs.length === 0 ? (
        <p className="admin-muted">No pairs configured on the server.</p>
      ) : (
        <div className="lab-table-scroll">
          <table className="lab-table">
            <thead>
              <tr>
                <th scope="col">Pair</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Seeded rows</th>
                <th scope="col">Seed version(s)</th>
                <th scope="col">Seeded at</th>
                <th scope="col" className="num">Live rows</th>
              </tr>
            </thead>
            <tbody>
              {data.pairs.map((row) => {
                const status = statusFor(row, data.current_prompt_version);
                return (
                  <tr key={row.pair}>
                    <td>{row.pair}</td>
                    <td>
                      <span className={`word-info-status ${status.toLowerCase()}`}>
                        {status}
                      </span>
                    </td>
                    <td className="num">{row.seeded_rows.toLocaleString("en-US")}</td>
                    <td>{versions(row.seeded_prompt_versions)}</td>
                    <td>{row.seeded_at ? row.seeded_at.slice(0, 10) : "—"}</td>
                    <td className="num">{row.live_rows.toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.pairs.length > 0 && (
        <section className="word-info-browse">
          <h2>Browse rows</h2>
          <div className="word-info-filters">
            <select
              className="admin-input"
              aria-label="Language pair"
              value={pair}
              onChange={(event) =>
                changeFilter(() => setPair(event.target.value))
              }
            >
              {data.pairs.map((candidate) => (
                <option key={candidate.pair} value={candidate.pair}>
                  {candidate.pair}
                </option>
              ))}
            </select>
            <input
              className="admin-input"
              type="search"
              placeholder="word contains…"
              aria-label="Word search"
              value={qDraft}
              onChange={(event) => setQDraft(event.target.value)}
            />
            <label className="word-info-filter-check">
              <input
                type="checkbox"
                checked={suspect}
                onChange={(event) =>
                  changeFilter(() => setSuspect(event.target.checked))
                }
              />
              Suspect only
            </label>
            <select
              className="admin-input"
              aria-label="Row status"
              value={status}
              onChange={(event) =>
                changeFilter(() =>
                  setStatus(event.target.value as "all" | "seeded" | "live"),
                )
              }
            >
              <option value="seeded">Seeded</option>
              <option value="live">Live</option>
              <option value="all">All</option>
            </select>
          </div>

          {rowsError && <p className="admin-error">{rowsError}</p>}
          {rowsLoading && <p className="admin-muted">Loading rows…</p>}
          {!rowsLoading && !rowsError && rows && rows.rows.length === 0 && (
            <p className="admin-muted">No rows match these filters.</p>
          )}
          {!rowsLoading && !rowsError && rows && rows.rows.length > 0 && (
            <div className="lab-table-scroll">
              <table className="lab-table">
                <thead>
                  <tr>
                    <th scope="col">Word</th>
                    <th scope="col">Transcription (IPA)</th>
                    <th scope="col">Display transcription</th>
                    <th scope="col">Gender</th>
                    <th scope="col">Emoji</th>
                    <th scope="col">Definition</th>
                    <th scope="col">Prompt version</th>
                    <th scope="col">Source</th>
                    <th scope="col">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.rows.map((row, index) => (
                    <tr key={`${row.word}-${row.created_at}-${index}`}>
                      <td>{row.word}</td>
                      <td>{row.transcription || "—"}</td>
                      <td>{row.display_transcription || "—"}</td>
                      <td>{row.gender ?? "—"}</td>
                      <td>{row.emoji || "—"}</td>
                      <td>
                        <span
                          className="word-info-definition"
                          title={row.definition}
                        >
                          {row.definition || "—"}
                        </span>
                      </td>
                      <td>{row.prompt_version}</td>
                      <td>
                        <span
                          className={`word-info-status ${
                            row.seeded ? "seeded" : "live"
                          }`}
                        >
                          {row.seeded ? "SEEDED" : "LIVE"}
                        </span>
                      </td>
                      <td>{row.created_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows && (
            <div className="admin-pager">
              <button
                className="admin-btn"
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || rowsLoading}
              >
                ← Prev
              </button>
              <span>
                Page {rows.page} of {totalPages} ·{" "}
                {rows.total.toLocaleString("en-US")} rows
              </span>
              <button
                className="admin-btn"
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages || rowsLoading}
              >
                Next →
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
