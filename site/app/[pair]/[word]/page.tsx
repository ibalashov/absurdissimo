import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardImage from "@/components/CardImage";
import { GetAppSection, SiteFooter, SiteNav } from "@/components/chrome";
import {
  Association,
  formatDate,
  getWordPage,
  imageUrl,
  languageName,
  PAIR_PATTERN,
  provenanceLabel,
  WordPageData,
} from "@/lib/api";
import "../../cards.css";

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

type Params = Promise<{ pair: string; word: string }>;

async function loadPage(params: Params): Promise<WordPageData | null> {
  const { pair, word } = await params;
  if (!PAIR_PATTERN.test(pair)) return null;
  return getWordPage(pair, decodeURIComponent(word));
}

function newestFirst(associations: Association[]): Association[] {
  return [...associations].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const data = await loadPage(params);
  if (!data) return { robots: { index: false, follow: true } };

  const cards = newestFirst(data.associations);
  const top = cards[0];
  const source = languageName(data.source_language);
  const target = languageName(data.target_language);
  const title = `${data.word} — ${source} to ${target} mnemonics | Absurdissimo`;
  const description = top
    ? truncate(top.mnemonic, 200)
    : `Mnemonic association cards for the ${source} word "${data.word}".`;
  const ogImages = top?.image_id ? [imageUrl(top.image_id)] : [];

  return {
    title,
    description,
    // noindex by default: indexing is quality-gated and flips per page in
    // phase 2 (see WEBSITE.md, SEO strategy).
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      images: ogImages,
    },
    twitter: {
      card: top?.image_id ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImages,
    },
  };
}

export default async function WordPairPage({ params }: { params: Params }) {
  const data = await loadPage(params);
  if (!data) notFound();

  const cards = newestFirst(data.associations);
  const source = languageName(data.source_language);
  const target = languageName(data.target_language);
  // word_info describes the word itself, not one card; take the newest.
  const info = cards.find((c) => c.word_info)?.word_info;

  return (
    <>
      <SiteNav />
      <main className="cards-main">
        <Link className="pair-crumb" href={`/${data.pair}`}>
          {source} → {target}
        </Link>
        <header className="word-header">
          <h1>
            {info?.emoji && <span className="word-emoji">{info.emoji}</span>}
            {data.word}
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
          <p className="card-count">
            {cards.length} mnemonic {cards.length === 1 ? "card" : "cards"},
            newest first
          </p>
        </header>

        <ul className="card-list">
          {cards.map((card) => (
            <li className="assoc-card" key={card.id}>
              {card.image_id && (
                <CardImage
                  src={imageUrl(card.image_id)}
                  alt={`Illustration of the mnemonic for ${data.word}`}
                />
              )}
              <div className="card-body">
                <p className="card-mnemonic">{card.mnemonic}</p>
                {card.explanation && (
                  <p className="card-explanation">{card.explanation}</p>
                )}
                <div className="card-footer">
                  <span className="provenance-badge">
                    {provenanceLabel(card.provenance)}
                  </span>
                  <span className="card-date">
                    {formatDate(card.created_at)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <GetAppSection />
      </main>
      <SiteFooter />
    </>
  );
}
