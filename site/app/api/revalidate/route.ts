import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { API_BASE, PAIR_PATTERN, deckTagsForPair } from "@/lib/api";

// On-demand deck revalidation for admin card hides (VocabCards #390). Hiding a
// card drops it from the server feed immediately, but the deck pages are
// ISR-cached (~1h), so a hidden card lingers on the cached home/pair/lang
// pages until the timer rolls over. The admin UI pings this route right after a
// successful hide; it busts *only* the decks that could show the card — the
// cross-pair home, its pair page, and its source-language page (deckTagsForPair)
// — so the card disappears within seconds while every other deck stays cached.
//
// Same origin, so the browser can call it without CORS. Admin-gated: the
// caller's bearer token is verified against the server's /admin/me (a uniform
// 403 for anyone not on the allowlist), so a random visitor can't force
// regenerations.
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm the caller is an allowlisted admin before spending any regeneration.
  let me: Response;
  try {
    me = await fetch(`${API_BASE}/admin/me`, {
      headers: { Authorization: auth },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Upstream unavailable" }, { status: 502 });
  }
  if (!me.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: { pair?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const pair = typeof payload.pair === "string" ? payload.pair : "";
  if (!PAIR_PATTERN.test(pair)) {
    return NextResponse.json({ error: "Invalid pair." }, { status: 422 });
  }

  // "max" is the Next 16 Route-Handler form of an on-demand purge (single-arg
  // is deprecated; updateTag is Server-Action-only).
  const tags = deckTagsForPair(pair);
  for (const tag of tags) revalidateTag(tag, "max");
  return NextResponse.json({ revalidated: true, tags });
}
