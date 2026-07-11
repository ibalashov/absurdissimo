import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import ProfileOwnPanel from "@/components/CommunityProfile";
import { SiteFooter, SiteNav } from "@/components/chrome";
import { formatDate, imageUrl } from "@/lib/api";
import { fetchProfileServer, profilePath } from "@/lib/community";
import { communityVisible } from "@/lib/flags";
import "../../../../cards.css";
import "../../../[pair]/[word]/community.css";

// Public community profile (VocabCards #317), inside the same launch gate as
// the rest of /c/*. Dynamic like the thread page: the profile changes with
// every submission/vote/rename. The URL is /c/u/{id}/{slug} where the id is
// authoritative and the slug is the handle purely for readability — a stale
// slug (rename) redirects to the canonical URL, so links never break.
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  // Profiles are UGC — keep them out of the index, like the threads.
  return {
    title: `${decodeURIComponent(slug)} — community profile | Absurdissimo`,
    robots: { index: false, follow: true },
  };
}

// "Member since July 2026" — month + year is enough for a join date.
function formatMonthYear(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(isoDate));
}

export default async function CommunityProfilePage({
  params,
}: {
  params: Params;
}) {
  const { id, slug } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // Owner-preview / launch gate, exactly as on /c/[pair]/[word].
  if (!(await communityVisible())) notFound();

  // 404 (unknown account / device actor) → notFound; anything else (5xx,
  // network, cold start) → soft unavailable state, never a hard 404.
  let profile: Awaited<ReturnType<typeof fetchProfileServer>>;
  try {
    profile = await fetchProfileServer(Number(id));
  } catch {
    return <ProfileUnavailable />;
  }
  if (!profile) notFound();

  // Canonicalize the cosmetic slug against the current handle (renames).
  if (decodeURIComponent(slug) !== profile.handle) {
    redirect(profilePath(profile.id, profile.handle));
  }

  const { entries } = profile;
  return (
    <>
      <SiteNav />
      <main className="cards-main community-main profile-main">
        <header className="word-header">
          <p className="profile-kicker">Community profile</p>
          <div className="profile-id">
            <Avatar emoji={profile.avatar} accountId={profile.id} size="lg" />
            <h1>{profile.handle}</h1>
          </div>
          <div className="statline">
            <span>
              member since <b>{formatMonthYear(profile.created_at)}</b>
            </span>
            <span>
              <b>{entries.length}</b>{" "}
              {entries.length === 1 ? "association" : "associations"}
            </span>
            <span>
              <b>{profile.comment_count}</b>{" "}
              {profile.comment_count === 1 ? "comment" : "comments"}
            </span>
          </div>
        </header>

        <ProfileOwnPanel profileId={profile.id} />

        {entries.length > 0 ? (
          <ul className="profile-entries">
            {entries.map((e) => (
              <li key={e.id}>
                <Link
                  className="profile-entry"
                  href={`/c/${e.pair}/${encodeURIComponent(e.word)}`}
                >
                  {e.image_id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="pthumb"
                      src={imageUrl(e.image_id)}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <span className="pscore" aria-label={`Score ${e.score}`}>
                    {e.score}
                  </span>
                  <span className="pbody">
                    <span className="pmnemonic" dir="auto">
                      {e.mnemonic}
                    </span>
                    <span className="pmeta">
                      <b dir="auto">{e.word}</b> · {e.pair} ·{" "}
                      {formatDate(e.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-thread">No contributions yet.</p>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

// Rendered when the community API is unreachable (5xx / network / cold start),
// as opposed to a genuine 404 for an unknown account.
function ProfileUnavailable() {
  return (
    <>
      <SiteNav />
      <main className="cards-main community-main">
        <p className="empty-thread">
          Community is temporarily unavailable — please try again in a moment.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
