import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import CardImage from "@/components/CardImage";
import CardTile from "@/components/CardTile";
import InlineMarkup from "@/components/InlineMarkup";
import MnemonicText from "@/components/MnemonicText";
import PronounceButton from "@/components/PronounceButton";
import { SiteFooter, SiteNav } from "@/components/chrome";
import {
  absurdityLabel,
  formatDate,
  getWordPage,
  imageUrl,
  languageName,
  PAIR_PATTERN,
  speechLanguageCode,
} from "@/lib/api";
import {
  CommunityEntry,
  CommunityThread,
  fetchThreadServer,
  profilePath,
  sortEntries,
} from "@/lib/community";
import "../../../../cards.css";
import "../community.css";

// The card permalink (VocabCards#507): one community entry — AI or
// user-submitted — addressed by its stable entry id. Data comes from the
// word-thread endpoint (which materializes AI entries on read), so there is
// no per-entry server lookup; an id not in the thread (hidden, removed,
// never existed) is a 404.

// Votes and comments change the thread on every request, same as the word page.
export const dynamic = "force-dynamic";

type Params = Promise<{ pair: string; word: string; entry: string }>;

// Deduped across generateMetadata and the page body within one request.
const loadThread = cache(
  (pair: string, word: string) => fetchThreadServer(pair, word),
);

interface CardPageData {
  thread: CommunityThread;
  card: CommunityEntry;
}

async function loadCard(params: Params): Promise<CardPageData | null> {
  const { pair, word, entry } = await params;
  if (!PAIR_PATTERN.test(pair) || !/^\d+$/.test(entry)) return null;
  const thread = await loadThread(pair, decodeURIComponent(word));
  const card = thread?.entries.find((e) => e.id === Number(entry));
  return thread && card ? { thread, card } : null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  let page: CardPageData | null;
  try {
    page = await loadCard(params);
  } catch {
    page = null; // API unreachable — the page body renders the soft state
  }
  if (!page) return { robots: { index: false, follow: true } };

  const { thread, card } = page;
  const source = languageName(thread.source_language);
  const target = languageName(thread.target_language);
  const title = `${thread.display_word} — ${source} to ${target} mnemonic card | Absurdissimo`;
  const description = truncate(card.mnemonic, 200);
  const ogImages = card.image_id ? [imageUrl(card.image_id)] : [];

  return {
    title,
    description,
    // noindex — same policy as the community threads (interactive/UGC).
    robots: { index: false, follow: true },
    openGraph: { title, description, type: "article", images: ogImages },
    twitter: {
      card: card.image_id ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImages,
    },
  };
}

export default async function CardPermalinkPage({
  params,
}: {
  params: Params;
}) {
  const { pair, word } = await params;
  // Same error split as the word page: 404 only when the thread/entry is
  // genuinely unknown; an unreachable API gets a soft retry state instead.
  let page: CardPageData | null;
  let wordPage: Awaited<ReturnType<typeof getWordPage>> = null;
  try {
    [page, wordPage] = await Promise.all([
      loadCard(params),
      getWordPage(pair, decodeURIComponent(word)).catch(() => null),
    ]);
  } catch {
    return <CardUnavailable pair={pair} />;
  }
  if (!page) notFound();

  const { thread, card } = page;
  const source = languageName(thread.source_language);
  const target = languageName(thread.target_language);
  const speechLang = speechLanguageCode(thread.source_language);
  // word_info describes the word, not one card; take the newest that has it.
  const info = wordPage?.associations.find((c) => c.word_info)?.word_info;
  const wordPath = `/c/${pair}/${encodeURIComponent(thread.word)}`;
  const siblings = sortEntries(
    thread.entries.filter((e) => e.id !== card.id),
    "top",
  ).slice(0, 8);

  return (
    <>
      <SiteNav />
      <main className="card-detail-main community-main">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={`/${pair}`}>
            {source} → {target}
          </Link>
          <span className="sep">/</span>
          {/* prefetch={false}: the thread route is force-dynamic */}
          <Link href={wordPath} prefetch={false} dir="auto">
            {thread.display_word}
          </Link>
          <span className="sep">/</span>
          <span className="here">card {card.id}</span>
        </nav>

        <div className="detail-grid">
          {card.image_id && (
            <CardImage
              className="detail-img"
              src={imageUrl(card.image_id)}
              alt={`Mnemonic illustration for ${thread.display_word}`}
            />
          )}
          <div>
            <div className="d-top">
              <span className="d-word" dir="auto">
                {thread.display_word}
              </span>
              {speechLang && (
                <PronounceButton word={thread.display_word} lang={speechLang} />
              )}
              {info?.transcription && (
                <span className="d-ipa">{info.transcription}</span>
              )}
              {info?.emoji && <span>{info.emoji}</span>}
            </div>
            {info && (
              <p className="d-def">
                {[
                  info.part_of_speech?.toLowerCase(),
                  info.gender,
                  info.definition,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p className="d-mnemonic" dir="auto">
              <MnemonicText text={card.mnemonic} keyword={card.keyword} />
            </p>
            {card.explanation && (
              <div className="d-why">
                <b>Why it works</b>
                <span dir="auto">
                  <InlineMarkup text={card.explanation} />
                </span>
              </div>
            )}
            <div className="d-chips">
              {card.is_pick && <span className="chip pick">✓ Community pick</span>}
              <span className="chip chip-pair">
                {source} → {target}
              </span>
              {card.absurdity && (
                <span className="chip chip-absurdity">
                  absurdity {absurdityLabel(card.absurdity)}
                </span>
              )}
              <span className="chip chip-prov">
                {card.kind === "ai" || card.author_handle === null ? (
                  "AI-generated"
                ) : card.author_id !== null ? (
                  <Link href={profilePath(card.author_id, card.author_handle)}>
                    {card.author_handle}
                  </Link>
                ) : (
                  card.author_handle
                )}{" "}
                · {formatDate(card.created_at)}
              </span>
              <span className="chip">
                score {card.score > 0 ? `+${card.score}` : card.score}
              </span>
            </div>
            <p className="d-discuss">
              {/* prefetch={false}: force-dynamic target, same as the crumb */}
              <Link href={`${wordPath}#entry-${card.id}`} prefetch={false}>
                Vote &amp; discuss this card →
              </Link>{" "}
              <span className="hint">
                {card.comments.length}{" "}
                {card.comments.length === 1 ? "comment" : "comments"} so far
              </span>
            </p>
            <div className="siblings">
              <h3>
                More cards for{" "}
                <span dir="auto">{thread.display_word}</span>
              </h3>
              {siblings.length > 0 ? (
                <div className="tile-grid">
                  {siblings.map((sib) => (
                    <CardTile
                      key={sib.id}
                      href={`${wordPath}/${sib.id}`}
                      imageSrc={sib.image_id ? imageUrl(sib.image_id) : null}
                      word={thread.display_word}
                      sub={
                        sib.absurdity
                          ? `${absurdityLabel(sib.absurdity)} · ${formatDate(sib.created_at)}`
                          : formatDate(sib.created_at)
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="sib-empty">
                  This is the only card so far —{" "}
                  <Link href="/app">make a better one in the app</Link>.
                </p>
              )}
            </div>
            <Link className="back" href={wordPath} prefetch={false}>
              ← All cards for {thread.display_word}
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// API unreachable (5xx / network / cold start) — soft 200 with a retry hint,
// mirroring the word page's CommunityUnavailable.
function CardUnavailable({ pair }: { pair: string }) {
  return (
    <>
      <SiteNav />
      <main className="card-detail-main community-main">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href={`/${pair}`}>← back</Link>
        </nav>
        <p className="empty-thread">
          This card is temporarily unavailable — please try again in a moment.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
