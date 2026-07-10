import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CommunityThread from "@/components/CommunityThread";
import { ViewToggle } from "@/components/ViewToggle";
import { GetAppSection, SiteFooter, SiteNav } from "@/components/chrome";
import { languageName, PAIR_PATTERN } from "@/lib/api";
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
  // start doesn't hard-404 a valid community page.
  let thread: Awaited<ReturnType<typeof fetchThreadServer>>;
  try {
    thread = await fetchThreadServer(pair, decoded);
  } catch {
    return <CommunityUnavailable pair={pair} />;
  }
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
          initialEntries={thread.entries}
        />

        <GetAppSection />
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
