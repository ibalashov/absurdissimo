"use client";

// Stats view (VocabCards #458): aggregate rollups over the same filtered
// inventory — count / spend / latency / tokens / errors / hidden per model,
// prompt version, provider, audience, absurdity, pair, or day.

import { useEffect, useState } from "react";
import {
  fetchCardStats,
  type InventoryStatsGroup,
  type InventoryStatsRow,
} from "@/lib/admin";
import { errorMessage, fmtMs, fmtUsd } from "../util";
import { useCards } from "../CardsContext";

const GROUPS: { key: InventoryStatsGroup; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "model", label: "Model" },
  { key: "prompt_version", label: "Prompt version" },
  { key: "provider", label: "Provider" },
  { key: "audience", label: "Audience" },
  { key: "absurdity", label: "Absurdity" },
  { key: "pair", label: "Pair" },
];

export default function CardsStatsPage() {
  const { apiFilters, filtersKey } = useCards();
  const [groupBy, setGroupBy] = useState<InventoryStatsGroup>("day");
  const [rows, setRows] = useState<InventoryStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCardStats(apiFilters, groupBy).then(
      (fresh) => {
        if (cancelled) return;
        setRows(fresh.rows);
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
  }, [filtersKey, groupBy]);

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      cost: acc.cost + (r.total_cost_usd ?? 0),
      errors: acc.errors + r.errors,
      hidden: acc.hidden + r.hidden,
    }),
    { count: 0, cost: 0, errors: 0, hidden: 0 },
  );

  return (
    <section className="admin-pane">
      <div className="cards-table-tools">
        <label className="pack-toolbar-label" htmlFor="stats-group">
          Group by
        </label>
        <select
          id="stats-group"
          className="admin-input"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as InventoryStatsGroup)}
        >
          {GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        {rows && (
          <span className="admin-muted">
            {totals.count.toLocaleString("en-US")} generations ·{" "}
            {fmtUsd(totals.cost)} · {totals.errors} errors · {totals.hidden}{" "}
            hidden
          </span>
        )}
      </div>

      {error && <p className="admin-error">{error}</p>}
      {!rows && !error && <p className="admin-muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="admin-muted">Nothing matches these filters.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="lab-table-scroll">
          <table className="lab-table">
            <thead>
              <tr>
                <th scope="col">{GROUPS.find((g) => g.key === groupBy)?.label}</th>
                <th scope="col" className="num">
                  Count
                </th>
                <th scope="col" className="num">
                  With telemetry
                </th>
                <th scope="col" className="num">
                  Total cost
                </th>
                <th scope="col" className="num">
                  Avg latency
                </th>
                <th scope="col" className="num">
                  Tok in
                </th>
                <th scope="col" className="num">
                  Tok out
                </th>
                <th scope="col" className="num">
                  Errors
                </th>
                <th scope="col" className="num">
                  Hidden
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.grp ?? "(none)"}>
                  <td>{r.grp ?? <span className="admin-muted">(none)</span>}</td>
                  <td className="num">{r.count.toLocaleString("en-US")}</td>
                  <td className="num">
                    {r.with_telemetry.toLocaleString("en-US")}
                  </td>
                  <td className="num">{fmtUsd(r.total_cost_usd)}</td>
                  <td className="num">{fmtMs(r.avg_latency_ms)}</td>
                  <td className="num">
                    {r.tokens_in?.toLocaleString("en-US") ?? "—"}
                  </td>
                  <td className="num">
                    {r.tokens_out?.toLocaleString("en-US") ?? "—"}
                  </td>
                  <td className="num">{r.errors}</td>
                  <td className="num">{r.hidden}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
