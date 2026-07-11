"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
// no client redirect. Only those sidebar actions change it; merely viewing
// a card or a pair deck (arriving by link) never rewrites the cookie.
//
// The sidebar groups pairs by studied (source) language under a flag-chip row
// (VocabCards#315): picking a flag narrows the deck to all of that language's
// pairs combined, at `/?lang=<code>` (ISO 639-1, as in pair slugs). The route
// stays the source of truth for the filter, but `/` must remain static (ISR),
// so the server component never reads searchParams — the `lang` param is read
// client-side by LangSync below (useSearchParams inside its own Suspense
// boundary, so nothing outside that null-rendering leaf deopts). A flag chip
// also writes the pair cookie to "all", otherwise the middleware's sticky-pair
// rewrite of "/" would swallow the lang narrowing. Language-narrowed state is
// URL-only — deliberately not session-sticky.

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

// Reports the `?lang=` search param up to DeckClient. useSearchParams on a
// static page must sit under a Suspense boundary; isolating it in this
// null-rendering leaf keeps the rest of the deck statically prerendered —
// wrapping DeckClient itself would put the whole deck behind the fallback.
function LangSync({ onLang }: { onLang: (lang: string | null) => void }) {
  const lang = useSearchParams().get("lang");
  useEffect(() => {
    onLang(lang);
  }, [lang, onLang]);
  return null;
}

// Pairs grouped by studied (source) language, in API order. `code` is the
// ISO 639-1 code from the pair slug ("it-en" → "it") — the same code the
// `?lang=` URL param and the server's `lang` filter use.
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

  // The `?lang=` param, reported by LangSync after hydration (null while
  // prerendered, so the static "/" HTML is always the full deck).
  const [langParam, setLangParam] = useState<string | null>(null);

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
  // The active language filter: only meaningful on the home route (a pair
  // route is already narrower), only for codes that exist in the corpus (an
  // unknown ?lang= is ignored rather than showing an empty deck), and never
  // in the degraded cards === null mode (no chips there to undo it).
  const langSel =
    cards !== null &&
    pairSel === "all" &&
    langParam &&
    langGroups.some((g) => g.code === langParam)
      ? langParam
      : null;
  const langGroup = langSel
    ? langGroups.find((g) => g.code === langSel)!
    : null;
  const totalCardsView = livePairs
    ? livePairs.reduce((n, p) => n + p.association_count, 0)
    : totalCards;
  const totalWordsView = livePairs
    ? livePairs.reduce((n, p) => n + p.word_count, 0)
    : totalWords;

  // Current page (1-based). Client state, not a URL param: reading it via
  // useSearchParams would deopt the indexable "/" out of static SSR. A pair
  // change is a full navigation, which remounts this and resets to page 1.
  // A lang-chip change is same-route (`/` → `/?lang=…`) and does NOT remount,
  // so the effect below resets the page instead.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [langSel]);

  // Session cache of fetched pages, keyed `${pairSel}#${page}`; "error" pins
  // the fallback so a failed page isn't refetched on every re-render.
  const [pageCache, setPageCache] = useState<
    Record<string, FeedCard[] | "error">
  >({});

  // Total cards for the current selection: site-wide for "all", the language's
  // pairs combined for a flag chip, else the pair's own corpus. Drives the
  // numbered pager. (The count includes the few image-less rows the feed drops
  // server-side, so the last page can come back short — handled by clamping
  // the pager to what the API returns.)
  const total = langGroup
    ? langGroup.total
    : pairSel === "all"
      ? totalCardsView
      : (pairsView.find((p) => p.pair === pairSel)?.association_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // "lang=" can't collide with pair slugs (always "xx-yy"), so one cache holds
  // both kinds of selection.
  const cacheKey = langSel ? `lang=${langSel}#${page}` : `${pairSel}#${page}`;
  // Page 1 of the cross-pair deck is the SSR preload; never refetch it.
  const isPreloadedPage = pairSel === "all" && !langSel && page === 1;
  const cached = pageCache[cacheKey];

  // Fetch the current page unless it's the SSR preload or already cached.
  useEffect(() => {
    if (cards === null || isPreloadedPage || pageCache[cacheKey]) return;
    let cancelled = false;
    fetchDeckPage(pairSel === "all" ? null : pairSel, page, langSel)
      .then((fetched) => {
        if (!cancelled) setPageCache((c) => ({ ...c, [cacheKey]: fetched }));
      })
      .catch(() => {
        if (!cancelled) setPageCache((c) => ({ ...c, [cacheKey]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, isPreloadedPage, cards, pageCache, pairSel, page, langSel]);

  const loading = cards !== null && !isPreloadedPage && cached === undefined;

  // The cards this page shows: the SSR preload for "all" page 1, the fetched
  // page once cached, or — only for page 1 of a pair or language while loading
  // / on error — a client-side filter of the preloaded cross-pair deck (for a
  // language, this is also the graceful degradation while the server's `lang`
  // filter, VocabCards#314, isn't deployed). Later pages have nothing to fall
  // back to.
  const activeCards = useMemo(() => {
    if (cards === null) return null;
    if (isPreloadedPage) return cards;
    if (cached && cached !== "error") return cached;
    if (page === 1 && langSel)
      return cards.filter((c) => c.pair.startsWith(`${langSel}-`));
    if (page === 1 && pairSel !== "all")
      return cards.filter((c) => c.pair === pairSel);
    return [];
  }, [cards, isPreloadedPage, cached, page, pairSel, langSel]);

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
          (langSel
            ? w.pair.startsWith(`${langSel}-`)
            : pairSel === "all" || w.pair === pairSel) &&
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
      <Suspense fallback={null}>
        <LangSync onLang={setLangParam} />
      </Suspense>
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
            {/* Flag chips: "All" plus one per studied language. The active
                chip IS the language-level filter (no "All ⟨language⟩"
                sub-row); "All" restores the full grouped view. Omitted in the
                degraded cards === null mode, where the groups below are plain
                links to the pair pages. */}
            {cards !== null && (
              <nav className="lang-chips" aria-label="Studied languages">
                <Link
                  className="lang-chip-all"
                  href="/"
                  onClick={() => rememberPair("all")}
                  aria-current={
                    pairSel === "all" && !langSel ? "true" : undefined
                  }
                >
                  All
                </Link>
                {langGroups.map((g) => (
                  <Link
                    key={g.code}
                    href={`/?lang=${g.code}`}
                    onClick={() => rememberPair("all")}
                    aria-current={langSel === g.code ? "true" : undefined}
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
                what makes the study direction self-decoding. A selected flag
                hides the other groups. */}
            <div className="pair-filter">
              {(langGroup ? [langGroup] : langGroups).map((g) => (
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
                          : () => rememberPair(p.pair)
                      }
                      aria-current={
                        cards !== null && pairSel === p.pair
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
