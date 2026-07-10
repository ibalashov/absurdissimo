import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CommunityThread from "@/components/CommunityThread";
import { GetAppSection, SiteFooter, SiteNav, ViewToggle } from "@/components/chrome";
import { languageName, PAIR_PATTERN } from "@/lib/api";
import { fetchThreadServer } from "@/lib/community";
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
  const decoded = decodeURIComponent(word);
  const thread = await fetchThreadServer(pair, decoded);
  if (!thread) notFound();

  const source = languageName(thread.source_language);
  const target = languageName(thread.target_language);

  return (
    <>
      <SiteNav />
      <main className="cards-main community-main">
        <div className="page-topbar">
          <Link className="pair-crumb" href={`/${pair}`}>
            {source} → {target}
          </Link>
          <ViewToggle pair={pair} word={decoded} active="community" />
        </div>
        <header className="word-header">
          <h1>{thread.display_word}</h1>
        </header>

        <CommunityThread
          pair={pair}
          word={decoded}
          displayWord={thread.display_word}
          initialEntries={thread.entries}
        />

        <GetAppSection />
      </main>
      <SiteFooter />
    </>
  );
}
