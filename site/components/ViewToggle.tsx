"use client";

import Link from "next/link";
import { VIEW_COOKIE, YEAR } from "@/lib/preview";

// Switch between the classic read-only word page and the community thread for
// the same word. Rendered on both pages so either view links to the other.
// A client component so a click can record the choice in VIEW_COOKIE, which
// the middleware honors for plain word links. The write must happen on click,
// client-side — and both links carry prefetch={false} — because prefetched
// GETs otherwise reach the middleware and any Set-Cookie there would stamp
// (and race) the choice without a click; prefetch could also cache a
// redirect that contradicts a cookie set only at click time.
export function ViewToggle({
  pair,
  word,
  active,
}: {
  pair: string;
  word: string;
  active: "classic" | "community";
}) {
  const encoded = encodeURIComponent(word);
  const remember = (view: "classic" | "community") => {
    // No `secure` attribute: a non-sensitive preference, and JS-set secure
    // cookies don't stick on plain-http dev hosts.
    document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=${YEAR}; samesite=lax`;
  };
  return (
    <div className="view-toggle" role="tablist" aria-label="View">
      <Link
        className={active === "classic" ? "on" : ""}
        href={`/${pair}/${encoded}`}
        prefetch={false}
        onClick={() => remember("classic")}
        aria-selected={active === "classic"}
        role="tab"
      >
        Classic
      </Link>
      <Link
        className={active === "community" ? "on" : ""}
        href={`/c/${pair}/${encoded}`}
        prefetch={false}
        onClick={() => remember("community")}
        aria-selected={active === "community"}
        role="tab"
      >
        Community
      </Link>
    </div>
  );
}
