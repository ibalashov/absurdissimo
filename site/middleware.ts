import { NextRequest, NextResponse } from "next/server";

// Home-route stickiness (no flash). When the visitor has picked a language pair
// this session — the `pair` cookie, written by the deck sidebar — rewrite "/"
// to that pair's deck. This is decided at the edge before any HTML is sent, so
// navigating home (the logo, or the browser back button) lands on the stuck
// pair with no client-side redirect and no all-pairs flash.
//
// Cookieless requests (crawlers, first-time visitors) fall through to the real
// all-pairs "/", the one indexable page, so its static rendering and SEO are
// untouched. "All pairs" in the sidebar clears the cookie to "all", which
// (not a pair slug) also falls through. Only "/" is matched, so this adds no
// overhead to any other route.
export function middleware(req: NextRequest) {
  const pair = req.cookies.get("pair")?.value;
  if (pair && /^[a-z]{2}-[a-z]{2}$/.test(pair)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${pair}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
