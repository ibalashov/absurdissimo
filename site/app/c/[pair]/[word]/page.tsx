import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdentityChip } from "@/components/CommunityAuth";
import CommunityThread from "@/components/CommunityThread";
import { ViewToggle } from "@/components/ViewToggle";
import { SiteFooter, SiteNav } from "@/components/chrome";
import {
  formatDate,
  getPairCards,
  getPairIndex,
  getWordPage,
  imageUrl,
  languageName,
  PAIR_PATTERN,
} from "@/lib/api";
import { fetchThreadServer } from "@/lib/community";
import { communityVisible } from "@/lib/flags";
import "../../../cards.css";
import "./community.css";

// Dynamic, not ISR: the thread changes on every vote/comment/submission, so
// the hourly-cached classic page (/[pair]/[word]) is the wrong model here.
export const dynamic = "force-dynamic";

type Params = Promise<{ pair: string; word: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { pair, word } = await params;
  const decoded = decodeURIComponent(word);
  // Community threads are interactive/UGC — keep them out of the index.
  return {
    title: `${decoded} — community mnemonics | Absurdissimo`,
    robots: { index: false, follow: true },
  };
}

export default async function CommunityWordPage({ params }: { params: Params }) {
  const { pair, word } = await params;
  if (!PAIR_PATTERN.test(pair)) notFound();
  // Owner-preview / launch gate: hidden from the public until COMMUNITY_ENABLED
  // (or a Draft Mode preview) turns it on. Safe here — /c is force-dynamic.
  if (!(await communityVisible())) notFound();
  const decoded = decodeURIComponent(word);

  // Distinguish "no such word" (API 404 → notFound) from "API unreachable"
  // (throws → soft unavailable state), so a transient backend blip / cold
  // start doesn't hard-404 a valid community page. The classic word page
  // (word_info for the identity header) and the pair index (related words)
  // ride along in parallel as optional garnish — both hourly-cached, and
  // either failing must never break the thread.
  let thread: Awaited<ReturnType<typeof fetchThreadServer>>;
  let wordPage: Awaited<ReturnType<typeof getWordPage>> = null;
  let pairIndex: Awaited<ReturnType<typeof getPairIndex>> = null;
  let pairCards: Awaited<ReturnType<typeof getPairCards>> = [];
  try {
    [thread, wordPage, pairIndex, pairCards] = await Promise.all([
      fetchThreadServer(pair, decoded),
      getWordPage(pair, decoded).catch(() => null),
      getPairIndex(pair).catch(() => null),
      getPairCards(pair),
    ]);
  } catch {
    return <CommunityUnavailable pair={pair} />;
  }
  if (!thread) notFound();

  const source = languageName(thread.source_language);
  const target = languageName(thread.target_language);

  // word_info describes the word itself, not one card; take the newest (same
  // rule as the classic page).
  const info = wordPage?.associations.find((c) => c.word_info)?.word_info;
  const commentCount = thread.entries.reduce(
    (n, e) => n + e.comments.length,
    0,
  );
  const hasPick = thread.entries.some((e) => e.is_pick);
  const latest = thread.entries
    .map((e) => e.created_at)
    .sort()
    .at(-1);
  // Related tiles come from the pair's feed sample (it carries emoji and an
  // image id per card, which the pair index doesn't); counts join in from the
  // index. One card per word, ranked by association count.
  const counts = new Map(
    (pairIndex?.words ?? []).map((w) => [w.word, w.association_count]),
  );
  const byWord = new Map<string, (typeof pairCards)[number]>();
  for (const c of pairCards) {
    if (c.word !== thread.word && !byWord.has(c.word)) byWord.set(c.word, c);
  }
  const related = [...byWord.values()]
    .sort((a, b) => (counts.get(b.word) ?? 0) - (counts.get(a.word) ?? 0))
    .slice(0, 8);

  return (
    <>
      {/* Signed-in visitors get their handle as a chip linking to their own
          profile (#317); signed out, the nav is unchanged. */}
      <SiteNav identity={<IdentityChip />} />
      <main className="cards-main community-main">
        <div className="page-topbar">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href={`/${pair}`}>
              {source} → {target}
            </Link>
            <span className="sep">/</span>
            <span className="here" dir="auto">
              {thread.display_word}
            </span>
          </nav>
          <ViewToggle pair={pair} word={decoded} active="community" />
        </div>
        <header className="word-header">
          <h1>
            {info?.emoji && <span className="word-emoji">{info.emoji}</span>}
            {thread.display_word}
          </h1>
          <div className="word-meta">
            {info?.transcription && <span>{info.transcription}</span>}
            {info?.part_of_speech && (
              <span>
                {info.part_of_speech.toLowerCase()}
                {info.gender ? `, ${info.gender}` : ""}
              </span>
            )}
          </div>
          {info?.definition && (
            <p className="word-definition">{info.definition}</p>
          )}
          <div className="statline">
            <span>
              <b>{thread.entries.length}</b>{" "}
              {thread.entries.length === 1 ? "mnemonic" : "mnemonics"}
            </span>
            <span>
              <b>{commentCount}</b>{" "}
              {commentCount === 1 ? "comment" : "comments"}
            </span>
            {hasPick && <span className="pickmark">✓ community pick decided</span>}
            {latest && (
              <span>
                latest activity <b>{formatDate(latest)}</b>
              </span>
            )}
          </div>
        </header>

        <CommunityThread
          pair={pair}
          word={decoded}
          initialEntries={thread.entries}
        />

        {related.length > 0 && (
          <section className="related">
            <h3>
              More {source} → {target} <span>· from this deck</span>
            </h3>
            <div className="word-strip">
              {/* Plain word links: the sticky-view middleware routes them to
                  the visitor's chosen view, so community-mode readers land on
                  the next thread. */}
              {related.map((c) => (
                <Link
                  className="wchip"
                  key={c.word}
                  href={`/${pair}/${encodeURIComponent(c.word)}`}
                  dir="auto"
                >
                  {c.image_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="wthumb"
                      src={imageUrl(c.image_id)}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    c.word_info?.emoji && (
                      <span className="wemoji">{c.word_info.emoji}</span>
                    )
                  )}
                  <span className="wlabel">
                    {c.word_info?.emoji && c.image_id && (
                      <span className="wemoji">{c.word_info.emoji} </span>
                    )}
                    {c.word}
                  </span>
                  {counts.has(c.word) && (
                    <span className="cnt">{counts.get(c.word)}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

// Rendered when the community API is unreachable (5xx / network / cold start),
// as opposed to a genuine 404 for an unknown word. Soft 200 with a retry hint
// rather than a hard not-found on a valid page.
function CommunityUnavailable({ pair }: { pair: string }) {
  return (
    <>
      <SiteNav />
      <main className="cards-main community-main">
        <div className="page-topbar">
          <Link className="pair-crumb" href={`/${pair}`}>
            ← back
          </Link>
        </div>
        <p className="empty-thread">
          Community is temporarily unavailable — please try again in a moment.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
