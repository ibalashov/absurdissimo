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
  languageFlag,
  languageName,
  PAGE_SIZE,
  PairSummary,
  WordIndexEntry,
} from "@/lib/api";

// The interactive deck: sticky toolbar (search, random card, new-card CTA, app
// CTA), sidebar (pair filter, corpus stats, app CTA) and the card feed. Sort,
// score pills and the duel widget are phase 2 (VocabCards#194) and absent — the
// feed is newest-first, so a lone "New" sort toggle did nothing and was removed.
//
// `cards === null` means GET /public/cards is unavailable (VocabCards#193 not
// deployed): the feed area degrades to a pair navigator and the pair filter
// becomes plain links to the pair pages.
//
// The full deck is browsable by numbered pages: the SSR preload is only page 1
// (the 48 newest), and every other page — plus every page of a narrowed
// selection — is fetched from the API by offset (`pair=` or `lang=` on
// /public/cards, mapped from the slug shape by fetchDeckPage). Pages are
// cached for the session; a fetch in flight shows a loading note, and page 1
// of a narrowed selection falls back to client-side filtering of the preloaded
// deck on failure (never worse than the pre-pagination behavior).
//
// ONE selection system (VocabCards#315 + #328): the deck's selection is a
// single slug with three shapes — "all" (cross-pair), "it" (all of a studied
// language's pairs, ISO 639-1 as in pair slugs), "it-en" (one pair) — and that
// slug IS the route: "/", "/it" and "/it-en" all render this deck with the
// selection preselected (the `[pair]` catch-all accepts both slug shapes).
// Selecting anything in the sidebar navigates rather than mutating local
// state, so the filter lives in the URL, survives the back button, and the
// active chip/row is knowable at render time — no hydration flip, no highlight
// jump.
//
// The selection sticks for the session via the `pair` cookie, one value of any
// slug shape, written onClick by the sidebar (rememberSel below).
// `middleware.ts` rewrites "/" to `/${cookie}` for pair and language shapes
// alike, decided at the edge before any HTML is sent (no flash, no client
// redirect); "all" falls through to the real "/". Only sidebar clicks change
// the cookie — arriving at a deck URL by link never rewrites it.

// Session cookie holding the sticky selection slug ("all" | "it" | "it-en").
// Name must match the cookie read in middleware.ts.
const SEL_COOKIE = "pair";

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

// Pairs grouped by studied (source) language, in API order. `code` is the
// ISO 639-1 code from the pair slug ("it-en" → "it") — the same code the
// `/it` route and the server's `lang` filter use.
interface LangGroup {
  code: string;
  name: string;
  pairs: PairSummary[];
  total: number;
}

function groupBySource(pairs: PairSummary[]): LangGroup[] {
  const groups = new Map<string, LangGroup>();
  for (const p of pairs) {
    const code = p.pair.split("-")[0];
    let g = groups.get(code);
    if (!g) {
      g = { code, name: p.source_language, pairs: [], total: 0 };
      groups.set(code, g);
    }
    g.pairs.push(p);
    g.total += p.association_count;
  }
  return [...groups.values()];
}

export default function DeckClient({
  pairs,
  cards,
  words,
  totalCards,
  totalWords,
  initialSel,
}: {
  pairs: PairSummary[];
  cards: FeedCard[] | null;
  words: WordIndexEntry[];
  totalCards: number;
  totalWords: number;
  // The route's selection slug — "all" on "/", a language code on "/it", a
  // pair slug on "/it-en" (see the header comment). The route is the source
  // of truth: everything below derives from this one value.
  initialSel: string;
}) {
  const router = useRouter();
  const sel = initialSel;
  // The flag chip carrying the accent outline: exactly one always does —
  // "All" (null) on "/", the language chip on "/it", and on a pair route the
  // pair's studied-language chip. Pure render-time derivation from the slug.
  const activeChip = sel === "all" ? null : sel.split("-")[0];
  // Does a pair belong to the current selection? This one predicate serves
  // the pager total, the search matches, and the client-side feed fallback,
  // across all three slug shapes.
  const inSel = (pairSlug: string) =>
    sel === "all" || pairSlug === sel || pairSlug.startsWith(`${sel}-`);
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
  const langGroups = useMemo(() => groupBySource(pairsView), [pairsView]);
  // The outline and the narrowing must never disagree: whenever a chip is
  // outlined (a language OR a pair route), only that language's group is
  // listed — a pair route showing every group read as "the filter stopped
  // working". "All" shows everything.
  const visibleGroups = activeChip
    ? langGroups.filter((g) => g.code === activeChip)
    : langGroups;
  const totalCardsView = livePairs
    ? livePairs.reduce((n, p) => n + p.association_count, 0)
    : totalCards;
  const totalWordsView = livePairs
    ? livePairs.reduce((n, p) => n + p.word_count, 0)
    : totalWords;

  // Current page (1-based). Client state, not a URL param: reading it via
  // useSearchParams would deopt the indexable "/" out of static SSR. Any
  // selection change is a full navigation, which remounts this and resets to
  // page 1.
  const [page, setPage] = useState(1);

  // Session cache of fetched pages, keyed `${sel}#${page}` (slug shapes are
  // distinct strings, so one scheme covers all three); "error" pins the
  // fallback so a failed page isn't refetched on every re-render.
  const [pageCache, setPageCache] = useState<
    Record<string, FeedCard[] | "error">
  >({});

  // Total cards for the current selection, driving the numbered pager. (The
  // count includes the few image-less rows the feed drops server-side, so the
  // last page can come back short — handled by clamping the pager to what the
  // API returns.)
  const total = pairsView
    .filter((p) => inSel(p.pair))
    .reduce((n, p) => n + p.association_count, 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cacheKey = `${sel}#${page}`;
  // The one selection asymmetry: page 1 of the cross-pair deck is the SSR
  // preload; never refetch it.
  const isPreloadedPage = sel === "all" && page === 1;
  const cached = pageCache[cacheKey];

  // Fetch the current page unless it's the SSR preload or already cached.
  useEffect(() => {
    if (cards === null || isPreloadedPage || pageCache[cacheKey]) return;
    let cancelled = false;
    fetchDeckPage(sel, page)
      .then((fetched) => {
        if (!cancelled) setPageCache((c) => ({ ...c, [cacheKey]: fetched }));
      })
      .catch(() => {
        if (!cancelled) setPageCache((c) => ({ ...c, [cacheKey]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, isPreloadedPage, cards, pageCache, sel, page]);

  const loading = cards !== null && !isPreloadedPage && cached === undefined;

  // The cards this page shows: the SSR preload for "all" page 1, the fetched
  // page once cached, or — only for page 1 of a narrowed selection while
  // loading / on error — a client-side filter of the preloaded cross-pair
  // deck. Later pages have nothing to fall back to.
  const activeCards = useMemo(() => {
    if (cards === null) return null;
    if (isPreloadedPage) return cards;
    if (cached && cached !== "error") return cached;
    if (page === 1 && sel !== "all")
      return cards.filter((c) => inSel(c.pair));
    return [];
    // inSel is a render-scoped closure over sel, which is in the deps.
  }, [cards, isPreloadedPage, cached, page, sel]);

  const shown = useMemo(
    () =>
      (activeCards ?? []).filter((c) => !q || c.word.toLowerCase().includes(q)),
    [activeCards, q],
  );

  const wordMatches = useMemo(() => {
    if (!q) return [];
    return words
      .filter((w) => inSel(w.pair) && w.word.toLowerCase().includes(q))
      .sort((a, b) => b.association_count - a.association_count)
      .slice(0, 12);
    // inSel is a render-scoped closure over sel, which is in the deps.
  }, [words, sel, q]);

  function randomCard() {
    if (!shown.length) return;
    router.push(cardHref(shown[Math.floor(Math.random() * shown.length)]));
  }

  // Card creation isn't supported on the web yet (it lives in the iOS app).
  // The "New card" button opens a "coming soon" modal and reports the interest
  // through the existing feedback relay (POST /api/feedback -> server /feedback
  // -> `feedback_submitted` PostHog event that emails Ivan), so demand for web
  // card creation is visible. Reported once per mount so repeat clicks don't
  // spam the inbox; best-effort, never blocks the UI.
  const [newCardOpen, setNewCardOpen] = useState(false);
  const newCardReported = useRef(false);
  function onNewCardClick() {
    setNewCardOpen(true);
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
  // Close the modal on Escape while it's open.
  useEffect(() => {
    if (!newCardOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setNewCardOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newCardOpen]);

  // Record the sidebar choice for the session before navigating away, so
  // middleware.ts can rewrite "/" to it — any selection slug shape: "all"
  // (falls through to the real "/"), a language code, or a pair. A session
  // cookie (no Max-Age): the selection sticks until the browser/tab closes or
  // the user picks something else.
  function rememberSel(slug: string) {
    if (typeof document !== "undefined") {
      document.cookie = `${SEL_COOKIE}=${slug}; path=/; SameSite=Lax`;
    }
  }

  function goToPage(n: number) {
    const clamped = Math.min(Math.max(1, n), pageCount);
    if (clamped === page) return;
    setPage(clamped);
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // The numbered pager, mirrored twice: inline on the feed-head row (top) and
  // below the grid (bottom). `place` only tweaks spacing/layout and the landmark
  // label so the two navs are distinguishable to screen readers. Hidden while
  // searching (search filters the current page) and for single-page decks.
  function pagerNav(place: "top" | "bottom") {
    if (cards === null || q || pageCount <= 1) return null;
    return (
      <nav
        className={place === "top" ? "pager pager-top" : "pager"}
        aria-label={place === "top" ? "Deck pages (top)" : "Deck pages"}
      >
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
    );
  }

  return (
    <>
      <div className="topbar">
        {/* prefetch={false}, like EVERY link to "/" in the app: "/"'s content
            is cookie-varied (the middleware rewrites it to the sticky
            selection's deck), but the router cache is URL-keyed and
            session-wide — a prefetch of "/" runs the middleware with the
            cookie as of prefetch time and pins that deck under "/" for
            minutes. Clicking "All" (or the logo) after the cookie changed
            then silently serves the stale deck: the URL flips to "/" but the
            content stays the old pair's (the #328 "flag filter stops working"
            regression; prod-only, prefetch is off in dev). */}
        <Link className="brand" href="/" prefetch={false}>
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
        <div className="topbar-actions">
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
          <button
            className="new-card-btn"
            title="Create a new card"
            aria-label="Create a new card"
            onClick={onNewCardClick}
          >
            +<span className="new-card-label"> New card</span>
          </button>
          <Link className="top-cta" href="/app">
            Get the app
          </Link>
        </div>
      </div>

      {newCardOpen && (
        <div
          className="modal-overlay"
          onClick={() => setNewCardOpen(false)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-card-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setNewCardOpen(false)}
            >
              ×
            </button>
            <p className="modal-emoji" aria-hidden="true">
              🃏
            </p>
            <h2 id="new-card-title">Creating cards on the web is coming soon</h2>
            <p className="modal-body">
              For now, cards are made in the Absurdissimo iPhone app — pick a
              word, and it dreams up an absurd mnemonic and image. Your cards
              show up here automatically.
            </p>
            <p className="modal-note">
              We’ve noted that you’d like to make cards on the web. 🙌
            </p>
            <div className="modal-actions">
              <Link className="modal-cta" href="/app">
                Get the app
              </Link>
              <button
                className="modal-dismiss"
                onClick={() => setNewCardOpen(false)}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shell">
        <aside>
          <div className="panel">
            <h3>What are you learning?</h3>
            {/* Flag chips: "All" plus one per studied language, linking to
                "/" and "/xx". Exactly one always carries the accent outline
                (activeChip): the language chip on its own route AND on its
                pairs' routes. Omitted in the degraded cards === null mode,
                where the groups below are plain links to the pair pages.
                Prefetch: the language chips are plain path links whose target
                never depends on the cookie, so default prefetch is safe; "All"
                keeps prefetch={false} because the middleware rewrites "/" by
                the cookie, and a prefetch runs it with the OLD cookie — the
                stale payload would be cached under "/" (prod-only: prefetch
                is off in dev). */}
            {cards !== null && (
              <nav className="lang-chips" aria-label="Studied languages">
                <Link
                  className="lang-chip-all"
                  href="/"
                  prefetch={false}
                  onClick={() => rememberSel("all")}
                  aria-current={activeChip === null ? "true" : undefined}
                >
                  All
                </Link>
                {langGroups.map((g) => (
                  <Link
                    key={g.code}
                    href={`/${g.code}`}
                    onClick={() => rememberSel(g.code)}
                    aria-current={activeChip === g.code ? "true" : undefined}
                    aria-label={`Only ${languageName(g.name)}`}
                    title={languageName(g.name)}
                  >
                    {languageFlag(g.name) ?? g.code.toUpperCase()}
                  </Link>
                ))}
              </nav>
            )}
            {/* Pairs grouped by studied language: a header row (flag + name +
                per-language total), then indented "in ⟨target⟩" rows linking
                to the pair routes. The title + "in ⟨language⟩" phrasing is
                what makes the study direction self-decoding. A language route
                hides the other groups. */}
            <div className="pair-filter">
              {visibleGroups.map((g) => (
                <div key={g.code} className="lang-group">
                  <div className="lang-group-head">
                    <span>
                      <span className="lang-group-flag" aria-hidden="true">
                        {languageFlag(g.name)}
                      </span>
                      {languageName(g.name)}
                    </span>
                    <span className="cnt">{g.total}</span>
                  </div>
                  {g.pairs.map((p) => (
                    <Link
                      key={p.pair}
                      href={`/${p.pair}`}
                      onClick={
                        cards === null
                          ? undefined
                          : () => rememberSel(p.pair)
                      }
                      aria-current={
                        cards !== null && sel === p.pair
                          ? "true"
                          : undefined
                      }
                    >
                      <span>in {languageName(p.target_language)}</span>
                      <span className="cnt">{p.association_count}</span>
                    </Link>
                  ))}
                </div>
              ))}
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
            <div className="feed-head-info">
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
            {pagerNav("top")}
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

          {pagerNav("bottom")}
        </main>
      </div>
    </>
  );
}
