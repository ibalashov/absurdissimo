import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GetAppSection, SiteFooter, SiteNav } from "@/components/chrome";
import {
  formatDate,
  getPairIndex,
  languageName,
  PAIR_PATTERN,
  PairIndexData,
} from "@/lib/api";
import "../cards.css";

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

type Params = Promise<{ pair: string }>;

async function loadIndex(params: Params): Promise<PairIndexData | null> {
  const { pair } = await params;
  if (!PAIR_PATTERN.test(pair)) return null;
  return getPairIndex(pair);
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const data = await loadIndex(params);
  if (!data) return { robots: { index: false, follow: true } };

  const source = languageName(data.source_language);
  const target = languageName(data.target_language);
  return {
    title: `${source} to ${target} mnemonics | Absurdissimo`,
    description: `Browse ${source} words with absurd, memorable mnemonic association cards for ${target} speakers.`,
    // noindex by default: indexing is quality-gated and flips per page in
    // phase 2 (see WEBSITE.md, SEO strategy).
    robots: { index: false, follow: true },
  };
}

export default async function PairIndexPage({ params }: { params: Params }) {
  const data = await loadIndex(params);
  if (!data) notFound();

  const source = languageName(data.source_language);
  const target = languageName(data.target_language);

  return (
    <>
      <SiteNav />
      <main className="cards-main">
        <header className="pair-header">
          <h1>
            {source} → {target} mnemonics
          </h1>
          <p>
            Recently added {source} words with mnemonic association cards.
          </p>
        </header>

        {data.words.length === 0 ? (
          <p className="empty-note">
            No words published for this pair yet — check back soon.
          </p>
        ) : (
          <ul className="word-list">
            {data.words.map((entry) => (
              <li key={entry.word}>
                <Link
                  className="word-list-item"
                  href={`/${data.pair}/${encodeURIComponent(entry.word)}`}
                >
                  <span className="word-list-word">{entry.word}</span>
                  <span className="word-list-meta">
                    {entry.association_count}{" "}
                    {entry.association_count === 1 ? "card" : "cards"} ·{" "}
                    {formatDate(entry.latest_created_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <GetAppSection />
      </main>
      <SiteFooter />
    </>
  );
}
