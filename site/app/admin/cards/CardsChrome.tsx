"use client";

// Shared chrome for the Cards sub-pages (VocabCards #458): heading, the
// server-side filter bar, and the sub-nav tabs. Rendered once by the layout's
// provider so filters stay put while switching views; only {children} swaps.
// Mirrors StarterPackChrome's structure and the .pack-tab styles.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFlag, languageName } from "@/lib/api";
import { ABSURDITIES } from "./util";
import { useCards } from "./CardsContext";

const SUB_PAGES = [
  { href: "/admin/cards", label: "Table" },
  { href: "/admin/cards/gallery", label: "Gallery" },
  { href: "/admin/cards/words", label: "By word" },
  { href: "/admin/cards/stats", label: "Stats" },
];

// Audiences the server stamps on generations (NULL on legacy rows).
const AUDIENCES = ["app", "probe", "backfill", "admin"];
const PROVIDERS = ["gemini", "openai"];

export default function CardsChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const {
    pairs,
    filters,
    setFilters,
    clearFilters,
    modelOptions,
    promptVersionOptions,
  } = useCards();

  // The word search commits debounced so the table isn't re-queried per
  // keystroke; everything else applies immediately.
  const [qDraft, setQDraft] = useState(filters.q);
  useEffect(() => {
    setQDraft(filters.q);
  }, [filters.q]);
  useEffect(() => {
    if (qDraft === filters.q) return;
    const handle = setTimeout(() => setFilters({ q: qDraft }), 300);
    return () => clearTimeout(handle);
  }, [qDraft, filters.q, setFilters]);

  return (
    <>
      <h1>Cards</h1>
      <p className="admin-intro">
        Every generated card variant, straight from the generation log —
        including hidden ones. Filters apply to all four views.
      </p>

      <div className="cards-filters">
        <select
          className="admin-input"
          aria-label="Language pair"
          value={filters.pair}
          onChange={(e) => setFilters({ pair: e.target.value })}
        >
          <option value="">all pairs</option>
          {(pairs ?? []).map((p) => (
            <option key={p.pair} value={p.pair}>
              {languageFlag(p.source_language) ?? ""}{" "}
              {languageName(p.source_language)} →{" "}
              {languageFlag(p.target_language) ?? ""}{" "}
              {languageName(p.target_language)}
            </option>
          ))}
        </select>
        <input
          className="admin-input cards-filter-q"
          type="search"
          placeholder="word contains…"
          aria-label="Word search"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
        />
        <select
          className="admin-input"
          aria-label="Model"
          value={filters.model}
          onChange={(e) => setFilters({ model: e.target.value })}
        >
          <option value="">any model</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="admin-input"
          aria-label="Prompt version"
          value={filters.promptVersion}
          onChange={(e) => setFilters({ promptVersion: e.target.value })}
        >
          <option value="">any prompt v</option>
          {promptVersionOptions.map((v) => (
            <option key={v} value={v}>
              prompt v{v}
            </option>
          ))}
        </select>
        <select
          className="admin-input"
          aria-label="Provider"
          value={filters.provider}
          onChange={(e) => setFilters({ provider: e.target.value })}
        >
          <option value="">any provider</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="admin-input"
          aria-label="Audience"
          value={filters.audience}
          onChange={(e) => setFilters({ audience: e.target.value })}
        >
          <option value="">any audience</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="admin-input"
          aria-label="Absurdity"
          value={filters.absurdity}
          onChange={(e) => setFilters({ absurdity: e.target.value })}
        >
          <option value="">any absurdity</option>
          {ABSURDITIES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          className="admin-input"
          aria-label="Status"
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value })}
        >
          <option value="">active + hidden</option>
          <option value="active">active</option>
          <option value="hidden">hidden</option>
        </select>
        <label className="cards-filter-date">
          from
          <input
            className="admin-input"
            type="date"
            value={filters.createdAfter}
            onChange={(e) => setFilters({ createdAfter: e.target.value })}
          />
        </label>
        <label className="cards-filter-date">
          to
          <input
            className="admin-input"
            type="date"
            value={filters.createdBefore}
            onChange={(e) => setFilters({ createdBefore: e.target.value })}
          />
        </label>
        <button className="admin-btn" onClick={clearFilters} type="button">
          Clear
        </button>
      </div>

      {filters.word && (
        <p className="cards-word-chip">
          word: <strong>{filters.word}</strong>{" "}
          <button
            className="admin-btn"
            type="button"
            onClick={() => setFilters({ word: "" })}
          >
            ✕
          </button>
        </p>
      )}

      <nav className="pack-tabs" aria-label="Cards views">
        {SUB_PAGES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`pack-tab${pathname === s.href ? " active" : ""}`}
            aria-current={pathname === s.href ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {children}
    </>
  );
}
