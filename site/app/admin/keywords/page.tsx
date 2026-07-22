"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { formatDateTime, languageFlag, languageName, type PairSummary } from "@/lib/api";
import {
  fetchAdminKeywords, fetchAdminPairs, proposeAdminKeywords,
  setAdminKeywordRank, setAdminKeywordVerdict,
  type AdminKeyword, type KeywordStatus,
} from "@/lib/admin";

const PAGE_SIZE = 50;
// Never bump this key: {visible, known} absorbs columns added later.
const COLUMNS_KEY = "admin.keywords.columns";
const COLUMNS = [
  ["select", ""], ["order", "Order"], ["word", "Word"],
  ["keyword", "Keyword"], ["status", "Status"], ["check", "Check verdict"],
  ["origin", "Origin / model"], ["used", "Used in cards"],
  ["created", "Created (UTC)"], ["actions", "Actions"],
] as const;
type ColumnKey = (typeof COLUMNS)[number][0];
const DEFAULT_COLUMNS = COLUMNS.map(([key]) => key);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function loadColumns(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_COLUMNS;
    const { visible, known } = parsed as { visible?: unknown; known?: unknown };
    if (!Array.isArray(visible) || !Array.isArray(known)) return DEFAULT_COLUMNS;
    const valid = new Set<unknown>(DEFAULT_COLUMNS);
    const kept = visible.filter((key): key is ColumnKey => valid.has(key));
    const saved = new Set(known);
    const fresh = DEFAULT_COLUMNS.filter((key) => !saved.has(key) && !kept.includes(key));
    return kept.length + fresh.length ? [...kept, ...fresh] : DEFAULT_COLUMNS;
  } catch { return DEFAULT_COLUMNS; }
}

function saveColumns(visible: ColumnKey[]) {
  try { localStorage.setItem(COLUMNS_KEY, JSON.stringify({ visible, known: DEFAULT_COLUMNS })); }
  catch { /* Keep the in-memory preference when storage is unavailable. */ }
}

function checkRejected(value: AdminKeyword["check_verdict"]) {
  if (value === false) return true;
  return typeof value === "string" && ["reject", "rejected", "fail", "failed", "false"]
    .includes(value.toLowerCase());
}

function serveSort(a: AdminKeyword, b: AdminKeyword) {
  if (a.word !== b.word) return a.word.localeCompare(b.word);
  const verified = Number(b.status === "verified") - Number(a.status === "verified");
  const rank = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
  return verified || rank || a.created_at.localeCompare(b.created_at);
}

export default function KeywordsPage() {
  const [pairs, setPairs] = useState<PairSummary[]>([]);
  const [pair, setPair] = useState("");
  const [status, setStatus] = useState<KeywordStatus | "all">("candidate");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminKeyword[]; total: number } | null>(null);
  const [counts, setCounts] = useState<Record<KeywordStatus, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [proposeWord, setProposeWord] = useState("");
  const [proposing, setProposing] = useState(false);
  const [visible, setVisible] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [dragKey, setDragKey] = useState<ColumnKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<ColumnKey | null>(null);

  useEffect(() => setVisible(loadColumns()), []);
  useEffect(() => {
    let cancelled = false;
    fetchAdminPairs().then((fresh) => {
      if (!cancelled) { setPairs(fresh); setPair((current) => current || fresh[0]?.pair || ""); }
    }, (err: unknown) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (qDraft === q) return;
    const timer = setTimeout(() => { setQ(qDraft.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [qDraft, q]);

  const refreshCounts = useCallback(async () => {
    if (!pair) return;
    try {
      const [candidate, verified, rejected] = await Promise.all(
        (["candidate", "verified", "rejected"] as const).map((kind) =>
          fetchAdminKeywords({ pair, status: kind, page: 1, page_size: 1 })),
      );
      setCounts({ candidate: candidate.total, verified: verified.total, rejected: rejected.total });
    } catch { setCounts(null); }
  }, [pair]);
  const refresh = useCallback(async () => {
    if (!pair) return;
    try {
      const fresh = await fetchAdminKeywords({ pair, status, q, page, page_size: PAGE_SIZE });
      setData(fresh); setSelected(new Set()); setError(null);
    } catch (err) { setError(errorMessage(err)); }
  }, [pair, status, q, page]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void refreshCounts(); }, [refreshCounts]);

  const groups = useMemo(() => {
    const result: { word: string; rows: AdminKeyword[] }[] = [];
    const byWord = new Map<string, { word: string; rows: AdminKeyword[] }>();
    for (const row of data?.items ?? []) {
      const existing = byWord.get(row.word);
      if (existing) existing.rows.push(row);
      else {
        const group = { word: row.word, rows: [row] };
        byWord.set(row.word, group);
        result.push(group);
      }
    }
    return result;
  }, [data]);

  async function applyVerdict(ids: number[], next: "verified" | "rejected") {
    if (!data || ids.length === 0) return;
    const idSet = new Set(ids), before = data;
    setBusy((current) => new Set([...current, ...ids]));
    setData({ ...data, items: data.items.map((row) => idSet.has(row.id) ? { ...row, status: next } : row) });
    try {
      const updated = await Promise.all(ids.map((id) => setAdminKeywordVerdict(id, next)));
      const byId = new Map(updated.map((row) => [row.id, row]));
      setData((current) => current && ({
        ...current,
        items: current.items.map((row) => byId.get(row.id) ?? row)
          .filter((row) => status === "all" || row.status === status),
        total: status === "all" ? current.total : Math.max(0, current.total - ids.length),
      }));
      setSelected((current) => new Set([...current].filter((id) => !idSet.has(id))));
      await refreshCounts();
    } catch (err) { setData(before); setError(errorMessage(err)); }
    finally { setBusy((current) => new Set([...current].filter((id) => !idSet.has(id)))); }
  }

  async function move(group: AdminKeyword[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= group.length || group[index].status !== group[target].status) return;
    const moved = [...group];
    [moved[index], moved[target]] = [moved[target], moved[index]];
    const ranks = new Map(moved.map((row, rank) => [row.id, rank]));
    // Normalize the complete visible group. Updating only the swapped pair is
    // insufficient when older ranks are sparse (for example 10, 20, 30).
    const ids = new Set(moved.map((row) => row.id));
    const before = data;
    setBusy((current) => new Set([...current, ...ids]));
    setData((current) => current && ({ ...current, items: current.items.map((row) =>
      ids.has(row.id) ? { ...row, rank: ranks.get(row.id)! } : row).sort(serveSort) }));
    try {
      const updated = await Promise.all([...ids].map((id) => setAdminKeywordRank(id, ranks.get(id)!)));
      const byId = new Map(updated.map((row) => [row.id, row]));
      setData((current) => current && ({ ...current,
        items: current.items.map((row) => byId.get(row.id) ?? row).sort(serveSort) }));
    } catch (err) { setData(before); setError(errorMessage(err)); }
    finally { setBusy((current) => new Set([...current].filter((id) => !ids.has(id)))); }
  }

  async function propose(event: FormEvent) {
    event.preventDefault();
    const word = proposeWord.trim();
    if (!pair || !word) return;
    setProposing(true);
    try {
      const rows = await proposeAdminKeywords({ pair, word });
      setData((current) => current && ({ ...current, items: [...rows, ...current.items], total: current.total + rows.length }));
      setProposeWord(""); setError(null); await refreshCounts();
    } catch (err) { setError(errorMessage(err)); }
    finally { setProposing(false); }
  }

  function toggleColumn(key: ColumnKey) {
    setVisible((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      saveColumns(next); return next;
    });
  }

  function moveColumn(fromKey: ColumnKey, toKey: ColumnKey) {
    setVisible((current) => {
      const from = current.indexOf(fromKey), to = current.indexOf(toKey);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
      saveColumns(next);
      return next;
    });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const selectedIds = [...selected];
  return <>
    <h1>Keywords</h1>
    <p className="admin-intro">Manual verification and serve-order ranking for the keyword store.</p>
    <div className="keywords-toolbar">
      <select className="admin-input" aria-label="Language pair" value={pair} onChange={(e) => { setPair(e.target.value); setPage(1); }}>
        {!pairs.length && <option value="">loading pairs…</option>}
        {pairs.map((item) => <option key={item.pair} value={item.pair}>{languageFlag(item.source_language) ?? ""} {languageName(item.source_language)} → {languageFlag(item.target_language) ?? ""} {languageName(item.target_language)}</option>)}
      </select>
      <select className="admin-input" aria-label="Keyword status" value={status} onChange={(e) => { setStatus(e.target.value as KeywordStatus | "all"); setPage(1); }}>
        <option value="candidate">candidate</option><option value="verified">verified</option><option value="rejected">rejected</option><option value="all">all statuses</option>
      </select>
      <input className="admin-input" type="search" aria-label="Word search" placeholder="word contains…" value={qDraft} onChange={(e) => setQDraft(e.target.value)} />
      <details className="cards-column-picker"><summary className="admin-btn">Columns</summary><div className="cards-column-menu">
        {COLUMNS.map(([key, label]) => <label key={key}><input type="checkbox" checked={visible.includes(key)} onChange={() => toggleColumn(key)} />{label || "Selection"}</label>)}
      </div></details>
    </div>
    <div className="keywords-counts" aria-label="Keyword counts">{(["candidate", "verified", "rejected"] as const).map((kind) =>
      <span className={`word-info-status ${kind}`} key={kind}>{kind} {counts ? counts[kind].toLocaleString("en-US") : "—"}</span>)}</div>
    <form className="keywords-propose" onSubmit={propose}><input className="admin-input" placeholder="propose for word…" aria-label="Propose for word" value={proposeWord} onChange={(e) => setProposeWord(e.target.value)} /><button className="admin-btn primary" disabled={!pair || !proposeWord.trim() || proposing}>{proposing ? "Proposing…" : "Propose"}</button></form>
    <div className="keywords-bulk"><span className="admin-muted">{selected.size} selected</span><button className="admin-btn" disabled={!selected.size} onClick={() => void applyVerdict(selectedIds, "verified")}>Verify selected</button><button className="admin-btn danger" disabled={!selected.size} onClick={() => void applyVerdict(selectedIds, "rejected")}>Reject selected</button></div>
    {error && <p className="admin-error">{error}</p>}
    {!data && !error && <p className="admin-muted">Loading keywords…</p>}
    {data?.items.length === 0 && <p className="admin-muted">Nothing matches these filters.</p>}
    {data && data.items.length > 0 && <div className="lab-table-scroll"><table className="lab-table keywords-table cards-table"><thead><tr>{visible.map((key) => <th scope="col" key={key} title="Drag to re-arrange" draggable onDragStart={(e) => { setDragKey(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); }} onDragOver={(e) => { if (dragKey && dragKey !== key) { e.preventDefault(); setDragOverKey(key); } }} onDrop={(e) => { e.preventDefault(); if (dragKey) moveColumn(dragKey, key); setDragKey(null); setDragOverKey(null); }} onDragEnd={() => { setDragKey(null); setDragOverKey(null); }} className={[key === "used" ? "num" : "", "cards-th-drag", dragKey === key ? "dragging" : "", dragOverKey === key && dragKey !== key ? "drop-target" : ""].filter(Boolean).join(" ")}>{COLUMNS.find(([candidate]) => candidate === key)?.[1]}</th>)}</tr></thead><tbody>
      {groups.flatMap((group) => group.rows.map((row, index) => <tr key={row.id} className={index === 0 ? "keywords-group-start" : undefined}>{visible.map((key) => <KeywordCell key={key} column={key} row={row} index={index} group={group.rows} busy={busy.has(row.id)} selected={selected.has(row.id)} onSelect={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(row.id); else next.delete(row.id); return next; })} onVerdict={(next) => void applyVerdict([row.id], next)} onMove={(delta) => void move(group.rows, index, delta)} />)}</tr>))}
    </tbody></table></div>}
    {data && totalPages > 1 && <div className="admin-pager"><button className="admin-btn" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Prev</button><span>Page {page} of {totalPages}</span><button className="admin-btn" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
  </>;
}

function KeywordCell({ column, row, index, group, busy, selected, onSelect, onVerdict, onMove }: {
  column: ColumnKey; row: AdminKeyword; index: number; group: AdminKeyword[]; busy: boolean;
  selected: boolean; onSelect: (checked: boolean) => void;
  onVerdict: (status: "verified" | "rejected") => void; onMove: (delta: -1 | 1) => void;
}) {
  if (column === "select") return <td><input type="checkbox" aria-label={`Select ${row.keyword}`} checked={selected} disabled={busy} onChange={(e) => onSelect(e.target.checked)} /></td>;
  if (column === "order") { const canUp = index > 0 && group[index - 1].status === row.status; const canDown = index < group.length - 1 && group[index + 1].status === row.status; return <td><span className="keywords-order"><button className="admin-btn" aria-label={`Move ${row.keyword} up`} disabled={busy || !canUp} onClick={() => onMove(-1)}>↑</button><button className="admin-btn" aria-label={`Move ${row.keyword} down`} disabled={busy || !canDown} onClick={() => onMove(1)}>↓</button><span className="admin-muted">{row.rank ?? "—"}</span></span></td>; }
  if (column === "word") return <td><strong>{row.word}</strong></td>;
  if (column === "keyword") return <td className="keywords-keyword">{row.keyword}</td>;
  if (column === "status") return <td><span className={`word-info-status ${row.status}`}>{row.status}</span></td>;
  if (column === "check") return <td><span className={checkRejected(row.check_verdict) ? "keywords-check-rejected" : undefined}>{row.check_verdict === null ? "—" : String(row.check_verdict)}</span></td>;
  if (column === "origin") return <td>{row.origin}{row.model ? <><br /><span className="admin-muted">{row.model}</span></> : null}</td>;
  if (column === "used") return <td className="num">{row.used_in_cards.toLocaleString("en-US")}</td>;
  if (column === "created") return <td>{formatDateTime(row.created_at)}</td>;
  return <td><span className="keywords-actions"><button className="admin-btn" disabled={busy || row.status === "verified"} onClick={() => onVerdict("verified")}>Verify</button><button className="admin-btn danger" disabled={busy || row.status === "rejected"} onClick={() => onVerdict("rejected")}>Reject</button></span></td>;
}
