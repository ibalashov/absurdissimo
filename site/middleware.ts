import { NextRequest, NextResponse } from "next/server";

const PAIR = /^[a-z]{2}-[a-z]{2}$/;
const YEAR = 60 * 60 * 24 * 365;

// The visitor's last classic-vs-community choice on word pages, remembered at
// the edge (same no-flash pattern as the home rewrite below). Visiting a
// community thread stamps it "community"; the toggle's Classic tab clears it
// via ?view=classic. Set/read only when community is on for this browser
// (preview marker or public launch flag), so public traffic and its static
// serving are untouched.
const VIEW_COOKIE = "vc_view";

function communityOn(req: NextRequest): boolean {
  return (
    process.env.COMMUNITY_ENABLED === "true" ||
    req.cookies.get("vc_community_preview")?.value === "1"
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Home-route stickiness (no flash). When the visitor has picked a language
  // pair this session — the `pair` cookie, written by the deck sidebar —
  // rewrite "/" to that pair's deck, decided at the edge before any HTML is
  // sent. Cookieless requests (crawlers, first-time visitors) fall through to
  // the real all-pairs "/", the one indexable page, so its static rendering
  // and SEO are untouched.
  if (pathname === "/") {
    const pair = req.cookies.get("pair")?.value;
    if (pair && PAIR.test(pair)) {
      const url = req.nextUrl.clone();
      url.pathname = `/${pair}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // Community thread page: remember that this visitor prefers the community
  // view, so plain word links (deck, search, shares) land there too.
  if (/^\/c\/[a-z]{2}-[a-z]{2}\/[^/]+$/.test(pathname)) {
    const res = NextResponse.next();
    if (communityOn(req) && req.cookies.get(VIEW_COOKIE)?.value !== "community") {
      res.cookies.set(VIEW_COOKIE, "community", {
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: YEAR,
      });
    }
    return res;
  }

  // Classic word page. The toggle's Classic tab links here with ?view=classic:
  // record the choice and redirect to the clean URL. Otherwise, a visitor who
  // last chose community gets sent to the community view of the same word.
  const word = pathname.match(/^\/([a-z]{2}-[a-z]{2})\/([^/]+)$/);
  if (word && communityOn(req)) {
    if (req.nextUrl.searchParams.get("view") === "classic") {
      const url = req.nextUrl.clone();
      url.searchParams.delete("view");
      const res = NextResponse.redirect(url);
      res.cookies.set(VIEW_COOKIE, "classic", {
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: YEAR,
      });
      return res;
    }
    if (req.cookies.get(VIEW_COOKIE)?.value === "community") {
      const url = req.nextUrl.clone();
      url.pathname = `/c${pathname}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// "/:pair/:word" is constrained to real pair slugs in the matcher itself, so
// routes like /api/* or /feedback never invoke the middleware.
export const config = {
  matcher: [
    "/",
    "/c/:pair/:word",
    "/:pair([a-z]{2}-[a-z]{2})/:word",
  ],
};
