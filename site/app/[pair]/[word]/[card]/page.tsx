import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CardImage from "@/components/CardImage";
import CardTile from "@/components/CardTile";
import { ClassicCommunityToggle } from "@/components/ClassicCommunityToggle";
import MnemonicText from "@/components/MnemonicText";
import PronounceButton from "@/components/PronounceButton";
import { SiteFooter, SiteNav } from "@/components/chrome";
import {
  Association,
  absurdityLabel,
  formatDate,
  getWordPage,
  imageUrl,
  languageName,
  PAIR_PATTERN,
  provenanceLabel,
  speechLanguageCode,
  WordPageData,
} from "@/lib/api";
import "../../../cards.css";

// Dedicated card page: one association, addressed by id (VocabCards#194).
// Data comes from the existing word endpoint — no server-side lookup by id.

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

type Params = Promise<{ pair: string; word: string; card: string }>;

interface CardPageData {
  data: WordPageData;
  card: Association;
}

async function loadCard(params: Params): Promise<CardPageData | null> {
  const { pair, word, card } = await params;
  if (!PAIR_PATTERN.test(pair) || !/^\d+$/.test(card)) return null;
  const data = await getWordPage(pair, decodeURIComponent(word));
  const found = data?.associations.find((a) => a.id === Number(card));
  return data && found ? { data, card: found } : null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const page = await loadCard(params);
  if (!page) return { robots: { index: false, follow: true } };

  const { data, card } = page;
  const source = languageName(data.source_language);
  const target = languageName(data.target_language);
  const title = `${data.word} — ${source} to ${target} mnemonic card | Absurdissimo`;
  const description = truncate(card.mnemonic, 200);
  const ogImages = card.image_id ? [imageUrl(card.image_id)] : [];

  return {
    title,
    description,
    // noindex, same policy as the word pages (quality-gated until phase 2).
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      images: ogImages,
    },
    twitter: {
      card: card.image_id ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImages,
    },
  };
}

export default async function CardPage({ params }: { params: Params }) {
  const page = await loadCard(params);
  if (!page) notFound();

  const { data, card } = page;
  const source = languageName(data.source_language);
  const target = languageName(data.target_language);
  const info = card.word_info;
  const speechLang = speechLanguageCode(data.source_language);
  const wordPath = `/${data.pair}/${encodeURIComponent(data.word)}`;
  const siblings = data.associations
    .filter((a) => a.id !== card.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <>
      <SiteNav />
      <main className="card-detail-main">
        <div className="page-topbar">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link href={`/${data.pair}`}>{data.pair}</Link>
            <span className="sep">/</span>
            <Link href={wordPath} dir="auto">
              {data.word}
            </Link>
            <span className="sep">/</span>
            <span className="here">card {card.id}</span>
          </nav>
          {/* Community links to the word's thread — threads are per-word, so
              this card's entry lives there. */}
          <ClassicCommunityToggle pair={data.pair} word={data.word} />
        </div>

        <div className="detail-grid">
          {card.image_id && (
            <CardImage
              className="detail-img"
              src={imageUrl(card.image_id)}
              alt={`Mnemonic illustration for ${data.word}`}
            />
          )}
          <div>
            <div className="d-top">
              <span className="d-word" dir="auto">
                {data.word}
              </span>
              {speechLang && <PronounceButton word={data.word} lang={speechLang} />}
              {info?.transcription && (
                <span className="d-ipa">{info.transcription}</span>
              )}
              {info?.emoji && <span>{info.emoji}</span>}
            </div>
            <p className="d-def">
              {[
                info?.part_of_speech?.toLowerCase(),
                info?.gender,
                info?.definition,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="d-mnemonic" dir="auto">
              <MnemonicText text={card.mnemonic} />
            </p>
            {card.explanation && (
              <div className="d-why">
                <b>Why it works</b>
                <span dir="auto">{card.explanation}</span>
              </div>
            )}
            <div className="d-chips">
              <span className="chip chip-pair">
                {source} → {target}
              </span>
              {card.absurdity && (
                <span className="chip chip-absurdity">
                  absurdity {absurdityLabel(card.absurdity)}
                </span>
              )}
              <span className="chip chip-prov">
                {provenanceLabel(card.provenance)} ·{" "}
                {formatDate(card.created_at)}
              </span>
            </div>
            <div className="siblings">
              <h3>
                More cards for <span dir="auto">{data.word}</span>
              </h3>
              {siblings.length > 0 ? (
                <div className="tile-grid">
                  {siblings.map((sib) => (
                    <CardTile
                      key={sib.id}
                      href={`${wordPath}/${sib.id}`}
                      imageSrc={sib.image_id ? imageUrl(sib.image_id) : null}
                      word={data.word}
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
            <Link className="back" href="/">
              ← Back to the deck
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
