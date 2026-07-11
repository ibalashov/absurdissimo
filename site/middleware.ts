import { NextRequest, NextResponse } from "next/server";

// The sticky selection slugs the deck sidebar writes to the `pair` cookie
// that rewrite "/": a pair ("it-en"), a studied-language code ("it",
// VocabCards#328), or a pair picked from the All view ("it-en+all" →
// /it-en?all=1, so the flag filter is restored along with the pair). "all"
// deliberately fails this test and falls through to the real "/".
const STICKY_SEL = /^([a-z]{2}(?:-[a-z]{2})?)(\+all)?$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Home-route stickiness (no flash). When the visitor has picked a deck
  // selection this session — the `pair` cookie, written onClick by the deck
  // sidebar — rewrite "/" to that selection's route (`/it-en` or `/it`),
  // decided at the edge before any HTML is sent. Cookieless requests
  // (crawlers, first-time visitors) fall through to the real all-pairs "/",
  // the one indexable page, so its static rendering and SEO are untouched.
  if (pathname === "/") {
    const sel = req.cookies.get("pair")?.value;
    const m = sel ? STICKY_SEL.exec(sel) : null;
    if (m) {
      const url = req.nextUrl.clone();
      url.pathname = `/${m[1]}`;
      if (m[2]) url.searchParams.set("all", "1");
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // Legacy classic word and card URLs → the word's community thread. The
  // classic read-only view is gone; every old external link (and any cached
  // /{pair}/{word}/{id} permalink) lands on the community page for the same
  // word. Threads are per-word, so a card path drops its id. Permanent: the
  // classic routes are deleted, not gated.
  const word = pathname.match(/^\/([a-z]{2}-[a-z]{2}\/[^/]+?)(?:\/\d+)?$/);
  if (word) {
    const url = req.nextUrl.clone();
    url.pathname = `/c/${word[1]}`;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

// "/:pair/..." is constrained to real pair slugs in the matcher itself, so
// routes like /api/* or /feedback never invoke the middleware.
export const config = {
  matcher: [
    "/",
    "/:pair([a-z]{2}-[a-z]{2})/:word",
    "/:pair([a-z]{2}-[a-z]{2})/:word/:card(\\d+)",
  ],
};
