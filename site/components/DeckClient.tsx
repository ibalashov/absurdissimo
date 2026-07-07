"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CardTile from "@/components/CardTile";
import {
  FeedCard,
  fetchPairCards,
  imageUrl,
  languageName,
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
// Selecting a pair fetches that pair's newest cards from the API
// (VocabCards#209) — the preloaded feed is only the 48 newest cards
// site-wide, so filtering it in memory starves every pair outside that
// window. Responses are cached per pair for the session; while a fetch is in
// flight the feed shows a loading note, and on failure it falls back to
// filtering the preloaded deck client-side (never worse than the old
// behavior).

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

export default function DeckClient({
  pairs,
  cards,
  words,
  totalCards,
  totalWords,
}: {
  pairs: PairSummary[];
  cards: FeedCard[] | null;
  words: WordIndexEntry[];
  totalCards: number;
  totalWords: number;
}) {
  const router = useRouter();
  const [pairSel, setPairSel] = useState("all");
  const [query, setQuery] = useState("");
  // Session cache of per-pair API responses; "error" pins the fallback
  // (client-side filter of the preloaded deck) so a failed pair isn't
  // refetched on every re-render.
  const [pairCache, setPairCache] = useState<
    Record<string, FeedCard[] | "error">
  >({});
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (pairSel === "all" || cards === null || pairCache[pairSel]) return;
    let cancelled = false;
    fetchPairCards(pairSel)
      .then((fetched) => {
        if (!cancelled) setPairCache((c) => ({ ...c, [pairSel]: fetched }));
      })
      .catch(() => {
        if (!cancelled) setPairCache((c) => ({ ...c, [pairSel]: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [pairSel, cards, pairCache]);

  const cached = pairSel === "all" ? undefined : pairCache[pairSel];
  const loading = pairSel !== "all" && cards !== null && cached === undefined;

  // The list the feed currently shows: the preloaded deck for "All pairs",
  // the pair's own API response once fetched, or the client-side filter of
  // the preloaded deck while loading / after a fetch failure.
  const activeCards = useMemo(() => {
    if (cards === null) return null;
    if (pairSel === "all") return cards;
    if (cached && cached !== "error") return cached;
    return cards.filter((c) => c.pair === pairSel);
  }, [cards, pairSel, cached]);

  const shown = useMemo(
    () =>
      (activeCards ?? []).filter(
        (c) => !q || c.word.toLowerCase().includes(q),
      ),
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
                  <button
                    aria-pressed={pairSel === "all"}
                    onClick={() => setPairSel("all")}
                  >
                    <span>All pairs</span>
                    <span className="cnt">{totalCards}</span>
                  </button>
                  {pairs.map((p) => (
                    <button
                      key={p.pair}
                      aria-pressed={pairSel === p.pair}
                      onClick={() => setPairSel(p.pair)}
                    >
                      <span>
                        {languageName(p.source_language)} →{" "}
                        {languageName(p.target_language)}
                      </span>
                      <span className="cnt">{p.association_count}</span>
                    </button>
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
                  : `${shown.length} of ${
                      // The pair's own corpus count, not the site-wide total:
                      // a filtered view spans only that pair.
                      pairSel === "all"
                        ? totalCards
                        : (pairs.find((p) => p.pair === pairSel)
                            ?.association_count ?? shown.length)
                    } in the deck`}
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
        </main>
      </div>
    </>
  );
}
