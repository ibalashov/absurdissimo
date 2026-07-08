"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CardTile from "@/components/CardTile";
import {
  FeedCard,
  fetchDeckPage,
  imageUrl,
  languageName,
  PAGE_SIZE,
  PAIR_PATTERN,
  PairSummary,
  WordIndexEntry,
} from "@/lib/api";

// The interactive deck: sticky toolbar (search, sort, random card, app CTA),
// sidebar (pair filter, corpus stats, app CTA) and the card feed. Sort ships
// "New" only; Top sort, score pills and the duel widget are phase 2
// (VocabCards#194) and deliberately absent.
//
// `cards === null` means GET /public/cards is unavailable (VocabCards#193 not
// deployed): the feed area degrades to a pair navigator and the pair filter
// becomes plain links to the pair pages.
//
// The full deck is browsable by numbered pages: the SSR preload is only page 1
// (the 48 newest, cross-pair or per-pair), and every other page — plus every
// page of a pair outside that newest window — is fetched from the API by
// offset. Pages are cached for the session; a fetch in flight shows a loading
// note, and page 1 of a pair falls back to client-side filtering of the
// preloaded deck on failure (never worse than the pre-pagination behavior).
//
// The selected pair sticks for the session: picking a pair or "All pairs" in
// the sidebar records it (sessionStorage), and landing on "/" restores it — so
// navigating home (e.g. the logo) keeps the pair. Only those two sidebar
// actions change it; see the effect below.

// sessionStorage key holding the sticky pair slug, or "all" for the cross-pair
// deck. Session-scoped on purpose (the request said "stick to session").
const PAIR_SESSION_KEY = "absurdissimo.pair";

function pairCode(pair: string): string {
  return pair.toUpperCase().replace("-", " → ");
}

function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

function cardHref(card: FeedCard): string {
  const wordPage = `/${card.pair}/${encodeURIComponent(card.word)}`;
  return card.id != null ? `${wordPage}/${card.id}` : wordPage;
}

// Windowed page list for the numbered pager: always the first and last page,
// plus one on each side of the current page, with "gap" markers for the rest.
// e.g. current 5 of 10 → [1, gap, 4, 5, 6, gap, 10].
function pageList(current: number, count: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let n = 1; n <= count; n++) {
    if (n === 1 || n === count || (n >= current - 1 && n <= current + 1)) {
      out.push(n);
    } else if (out[out.length - 1] !== "gap") {
      out.push("gap");
    }
  }
  return out;
}

export default function DeckClient({
  pairs,
  cards,
  words,
  totalCards,
  totalWords,
  initialPair,
}: {
  pairs: PairSummary[];
  cards: FeedCard[] | null;
  words: WordIndexEntry[];
  totalCards: number;
  totalWords: number;
  // Which pair the sidebar filter starts on: "all" on the home route (`/`) or
  // a pair slug on `/[pair]`. The route is the source of truth for the pair —
  // selecting one navigates rather than mutating local state, so the filter
  // lives in the URL and survives the back button.
  initialPair: string;
}) {
  const router = useRouter();
  const pairSel = initialPair;
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Current page (1-based). Client state, not a URL param: reading it via
  // useSearchParams would deopt the indexable "/" out of static SSR. A pair
  // change is a full navigation, which remounts this and resets to page 1.
  const [page, setPage] = useState(1);

  // Session cache of fetched pages, keyed `${pairSel}#${page}`; "error" pins
  // the fallback so a failed page isn't refetched on every re-render.
  const [pageCache, setPageCache] = useState<
    Record<string, FeedCard[] | "error">
  >({});

  // Total cards for the current selection: site-wide for "all", else the pair's
  // own corpus. Drives the numbered pager. (The count includes the few
  // image-less rows the feed drops server-side, so the last page can come back
  // short — handled by clamping the pager to what the API returns.)
  const total =
    pairSel === "all"
      ? totalCards
      : (pairs.find((p) => p.pair === pairSel)?.association_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cacheKey = `${pairSel}#${page}`;
  // Page 1 of the cross-pair deck is the SSR preload; never refetch it.
  const isPreloadedPage = pairSel === "all" && page === 1;
  const cached = pageCache[cacheKey];

  // Persist the selected pair and restore it on the home route so it sticks for
  // the session. On "/" (pairSel "all") a stored pair bounces to `/[pair]`;
  // picking a pair or "All pairs" writes sessionStorage on click (the logo does
  // not, so it lands back on the stuck pair). SSR still renders "/" as the
  // all-pairs deck for crawlers — this restore is a client enhancement.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pairSel === "all") {
      const stored = window.sessionStorage.getItem(PAIR_SESSION_KEY);
      if (
        stored &&
        stored !== "all" &&
        PAIR_PATTERN.test(stored) &&
        pairs.some((p) => p.pair === stored)
      ) {
        router.replace(`/${stored}`);
      }
    } else {
      window.sessionStorage.setItem(PAIR_SESSION_KEY, pairSel);
    }
    // Only re-run when the route's pair changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairSel]);

  // Fetch the current page unless it's the SSR preload or already cached.
  useEffect(() => {
    if (cards === null || isPreloadedPage || pageCache[cacheKey]) return;
    let cancelled = false;
    fetchDeckPage(pairSel === "all" ? null : pairSel, page)
      .then((fetched) => {
        if (!cancelled) setPageCache((c) => ({ ...c, [cacheKey]: fetched }));
      })
      .catch(() => {
        if (!cancelled) setPageCache((c) => ({ ...c, [cacheKey]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, isPreloadedPage, cards, pageCache, pairSel, page]);

  const loading = cards !== null && !isPreloadedPage && cached === undefined;

  // The cards this page shows: the SSR preload for "all" page 1, the fetched
  // page once cached, or — only for page 1 of a pair while loading / on error —
  // a client-side filter of the preloaded cross-pair deck. Later pages have
  // nothing to fall back to.
  const activeCards = useMemo(() => {
    if (cards === null) return null;
    if (isPreloadedPage) return cards;
    if (cached && cached !== "error") return cached;
    if (page === 1 && pairSel !== "all")
      return cards.filter((c) => c.pair === pairSel);
    return [];
  }, [cards, isPreloadedPage, cached, page, pairSel]);

  const shown = useMemo(
    () =>
      (activeCards ?? []).filter((c) => !q || c.word.toLowerCase().includes(q)),
    [activeCards, q],
  );

  const wordMatches = useMemo(() => {
    if (!q) return [];
    return words
      .filter(
        (w) =>
          (pairSel === "all" || w.pair === pairSel) &&
          w.word.toLowerCase().includes(q),
      )
      .sort((a, b) => b.association_count - a.association_count)
      .slice(0, 12);
  }, [words, pairSel, q]);

  function randomCard() {
    if (!shown.length) return;
    router.push(cardHref(shown[Math.floor(Math.random() * shown.length)]));
  }

  // Record the sidebar choice for the session before navigating away; the
  // restore effect re-applies it when the user later lands on "/".
  function rememberPair(slug: string) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(PAIR_SESSION_KEY, slug);
    }
  }

  function goToPage(n: number) {
    const clamped = Math.min(Math.max(1, n), pageCount);
    if (clamped === page) return;
    setPage(clamped);
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div className="topbar">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Absurdissimo icon" />
          Absurdissimo
        </Link>
        <label className="search">
          <span>🔎</span>
          <input
            type="search"
            placeholder="Find a word… (try: viaggio)"
            aria-label="Search words"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="sort" role="group" aria-label="Sort order">
          <button aria-pressed="true">New</button>
        </div>
        {cards !== null && shown.length > 0 && (
          <button
            className="icon-btn"
            title="Random card"
            aria-label="Open a random card"
            onClick={randomCard}
          >
            🎲
          </button>
        )}
        <Link className="top-cta" href="/app">
          Get the app
        </Link>
      </div>

      <div className="shell">
        <aside>
          <div className="panel">
            <h3>Language pairs</h3>
            <div className="pair-filter">
              {cards === null ? (
                pairs.map((p) => (
                  <Link key={p.pair} href={`/${p.pair}`}>
                    <span>
                      {languageName(p.source_language)} →{" "}
                      {languageName(p.target_language)}
                    </span>
                    <span className="cnt">{p.association_count}</span>
                  </Link>
                ))
              ) : (
                <>
                  <Link
                    href="/"
                    onClick={() => rememberPair("all")}
                    aria-current={pairSel === "all" ? "true" : undefined}
                  >
                    <span>All pairs</span>
                    <span className="cnt">{totalCards}</span>
                  </Link>
                  {pairs.map((p) => (
                    <Link
                      key={p.pair}
                      href={`/${p.pair}`}
                      onClick={() => rememberPair(p.pair)}
                      aria-current={pairSel === p.pair ? "true" : undefined}
                    >
                      <span>
                        {languageName(p.source_language)} →{" "}
                        {languageName(p.target_language)}
                      </span>
                      <span className="cnt">{p.association_count}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="panel side-stats">
            <div>
              <b>{totalCards}</b>cards
            </div>
            <div>
              <b>{totalWords}</b>words
            </div>
            <div>
              <b>{pairs.length}</b>pairs
            </div>
          </div>
          <div className="panel side-cta">
            Every card here was generated by someone learning a word in the{" "}
            <Link href="/app">Absurdissimo iPhone app</Link>. Make your own →
          </div>
        </aside>

        <main>
          <div className="feed-head">
            <h1>Newest cards</h1>
            {cards !== null && (
              <span>
                {loading
                  ? "Loading…"
                  : q
                    ? `${shown.length} match${
                        shown.length === 1 ? "" : "es"
                      } on this page`
                    : `Page ${page} of ${pageCount} · ${total} cards`}
              </span>
            )}
          </div>

          {wordMatches.length > 0 && (
            <div className="word-matches">
              {wordMatches.map((w) => (
                <Link
                  key={`${w.pair}/${w.word}`}
                  href={`/${w.pair}/${encodeURIComponent(w.word)}`}
                >
                  <span dir="auto">{w.word}</span>
                  <span className="cnt">
                    {pairCode(w.pair)} · {w.association_count}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {cards === null ? (
            <>
              <p className="pair-nav-note">
                The live card feed isn’t available right now — browse the deck
                by language pair:
              </p>
              <ul className="pair-nav-list">
                {pairs.map((p) => (
                  <li key={p.pair}>
                    <Link className="pair-nav-link" href={`/${p.pair}`}>
                      <span className="pair-nav-pair">
                        {languageName(p.source_language)} →{" "}
                        {languageName(p.target_language)}
                      </span>
                      <span className="pair-nav-count">
                        {p.association_count}{" "}
                        {p.association_count === 1 ? "card" : "cards"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : loading ? (
            <p className="empty-feed">Loading cards…</p>
          ) : cached === "error" && page > 1 ? (
            <p className="empty-feed">
              Couldn’t load this page — check your connection and try again.
            </p>
          ) : shown.length === 0 ? (
            <p className="empty-feed">
              No cards match{q ? ` “${query.trim()}”` : ""} — try another word
              or pair.
            </p>
          ) : (
            <div className="tile-grid">
              {shown.map((c, i) => (
                <CardTile
                  key={c.id ?? `${c.pair}/${c.word}/${i}`}
                  href={cardHref(c)}
                  imageSrc={c.image_id ? imageUrl(c.image_id) : null}
                  word={c.word}
                  sub={`${pairCode(c.pair)} · ${shortDate(c.created_at)}`}
                />
              ))}
            </div>
          )}

          {cards !== null && !q && pageCount > 1 && (
            <nav className="pager" aria-label="Deck pages">
              <button
                className="pager-btn"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                ‹ Prev
              </button>
              {pageList(page, pageCount).map((it, i) =>
                it === "gap" ? (
                  <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    className="pager-num"
                    aria-label={`Page ${it}`}
                    aria-current={it === page ? "page" : undefined}
                    onClick={() => goToPage(it)}
                  >
                    {it}
                  </button>
                ),
              )}
              <button
                className="pager-btn"
                disabled={page >= pageCount}
                onClick={() => goToPage(page + 1)}
              >
                Next ›
              </button>
            </nav>
          )}
        </main>
      </div>
    </>
  );
}
