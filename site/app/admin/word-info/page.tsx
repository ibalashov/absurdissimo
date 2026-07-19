"use client";

import { useEffect, useState } from "react";
import {
  fetchWordInfoStatus,
  type WordInfoStatusPair,
  type WordInfoStatusResponse,
} from "@/lib/admin";

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

  useEffect(() => {
    let cancelled = false;
    fetchWordInfoStatus().then(
      (fresh) => {
        if (!cancelled) setData(fresh);
      },
      (err: unknown) => {
        if (!cancelled) setLoadError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

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
    </>
  );
}
