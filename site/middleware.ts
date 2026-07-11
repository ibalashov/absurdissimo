import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, communityAllowed, VIEW_COOKIE } from "@/lib/preview";

const PAIR = /^[a-z]{2}-[a-z]{2}$/;

export async function middleware(req: NextRequest) {
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

  // Sticky view choice on classic word and card pages. ViewToggle records the
  // visitor's classic-vs-community pick in VIEW_COOKIE client-side, on click
  // (never here: middleware Set-Cookie on GET paths also fires on <Link>
  // prefetches, which would stamp and race the choice without a click). This
  // branch only honors it: plain word links — and card permalinks, which is
  // what the home deck's tiles are — redirect to the word's community thread
  // for browsers that chose it AND still pass the exact auth gate the /c
  // route enforces — gating on the cosmetic marker cookie instead would
  // dead-end every word page in /c's 404 whenever the marker outlives the
  // auth cookie (secret rotation, cookie eviction). A redirect, not a
  // rewrite: the URL must say /c so the community page's toggle state and
  // links stay coherent. Threads are per-word, so a card path drops its id.
  const word = pathname.match(/^(\/[a-z]{2}-[a-z]{2}\/[^/]+?)(?:\/\d+)?$/);
  if (
    word &&
    req.cookies.get(VIEW_COOKIE)?.value === "community" &&
    (await communityAllowed(req.cookies.get(AUTH_COOKIE)?.value))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = `/c${word[1]}`;
    return NextResponse.redirect(url);
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
