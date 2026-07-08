"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CardTile from "@/components/CardTile";
import {
  FeedCard,
  fetchDeckPage,
  fetchPairsLive,
  imageUrl,
  languageName,
  PAGE_SIZE,
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
// The selected pair sticks for the session via the `pair` cookie: picking a
// pair or "All pairs" in the sidebar writes it (rememberPair below), and
// `middleware.ts` reads it to rewrite "/" to that pair's deck at the edge — so
// navigating home (the logo, the back button) keeps the pair with no flash and
// no client redirect. Only those two sidebar actions change it; merely viewing
// a card or a pair deck (arriving by link) never rewrites the cookie.

// Session cookie holding the sticky pair slug (or "all" for the cross-pair
// deck). Name must match the cookie read in middleware.ts.
const PAIR_COOKIE = "pair";

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

  // The count props (pair chips, corpus stats, pager total) come from the
  // hour-cached SSR render, but the feed's cards are fetched live — so freshly
  // generated cards show up beneath a stale count. Refetch the summaries live
  // on mount and prefer them, so every count tracks the cards. Falls back to
  // the SSR props on failure or until the fetch lands (no hydration mismatch:
  // this only updates after the first client render).
  const [livePairs, setLivePairs] = useState<PairSummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPairsLive().then((fresh) => {
      if (!cancelled && fresh.length) setLivePairs(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const pairsView = livePairs ?? pairs;
  const totalCardsView = livePairs
    ? livePairs.reduce((n, p) => n + p.association_count, 0)
    : totalCards;
  const totalWordsView = livePairs
    ? livePairs.reduce((n, p) => n + p.word_count, 0)
    : totalWords;

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
      ? totalCardsView
      : (pairsView.find((p) => p.pair === pairSel)?.association_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cacheKey = `${pairSel}#${page}`;
  // Page 1 of the cross-pair deck is the SSR preload; never refetch it.
  const isPreloadedPage = pairSel === "all" && page === 1;
  const cached = pageCache[cacheKey];

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

  // Card creation isn't supported on the web yet (it lives in the iOS app).
  // The "New card" button surfaces a "coming soon" hint and reports the
  // interest through the existing feedback relay (POST /api/feedback ->
  // server /feedback -> `feedback_submitted` PostHog event that emails Ivan),
  // so demand for web card creation is visible. Reported once per mount so
  // repeat clicks don't spam the inbox; best-effort, never blocks the UI.
  const [newCardHint, setNewCardHint] = useState(false);
  const newCardReported = useRef(false);
  function onNewCardClick() {
    setNewCardHint(true);
    if (newCardReported.current) return;
    newCardReported.current = true;
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "[deck] Someone tapped “New card” on the website — wants to create cards on the web (only the app supports it today).",
      }),
    }).catch(() => {});
  }
  useEffect(() => {
    if (!newCardHint) return;
    const t = setTimeout(() => setNewCardHint(false), 3200);
    return () => clearTimeout(t);
  }, [newCardHint]);

  // Record the sidebar choice for the session before navigating away, so
  // middleware.ts can rewrite "/" to it. A session cookie (no Max-Age): the
  // pair sticks until the browser/tab closes or the user picks another pair or
  // "All pairs" (which writes "all", falling through to the real "/").
  function rememberPair(slug: string) {
    if (typeof document !== "undefined") {
      document.cookie = `${PAIR_COOKIE}=${slug}; path=/; SameSite=Lax`;
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
        <div className="new-card">
          <button
            className="new-card-btn"
            title="Create a new card"
            aria-label="Create a new card"
            onClick={onNewCardClick}
          >
            +<span className="new-card-label"> New card</span>
          </button>
          {newCardHint && (
            <span className="new-card-hint" role="status">
              Creating cards on the web is coming soon — for now, make them in
              the app.
            </span>
          )}
        </div>
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
                pairsView.map((p) => (
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
                    <span className="cnt">{totalCardsView}</span>
                  </Link>
                  {pairsView.map((p) => (
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
              <b>{totalCardsView}</b>cards
            </div>
            <div>
              <b>{totalWordsView}</b>words
            </div>
            <div>
              <b>{pairsView.length}</b>pairs
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
                {pairsView.map((p) => (
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
