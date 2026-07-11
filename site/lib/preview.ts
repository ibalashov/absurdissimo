// Community-preview gate + sticky-view constants and helpers, shared by the
// server (flags.ts, the /api/community-preview route), the edge middleware,
// and client components. Deliberately free of next/headers so all three can
// import it — cookie names living here is what keeps the gate, the toggle
// reveal, and the ?key=off reset from drifting apart. Delete together with
// the preview wiring on public launch.

// httpOnly auth cookie: holds sha256(COMMUNITY_PREVIEW_SECRET), the
// authoritative per-browser gate. We deliberately do NOT use Next Draft Mode:
// its bypass cookie is a session cookie tied to the build's previewModeId, so
// every deploy and browser restart silently killed the preview.
export const AUTH_COOKIE = "vc_community_auth";

// Non-httpOnly sibling, read client-side by ClassicCommunityToggle to reveal
// the toggle on the static classic page without going dynamic. A marker, not
// a credential.
export const MARKER_COOKIE = "vc_community_preview";

// The visitor's last classic-vs-community pick, written client-side by
// ViewToggle on click (never by the middleware — Set-Cookie on GET paths also
// fires on <Link> prefetches) and honored by the middleware redirect.
export const VIEW_COOKIE = "vc_view";

export const YEAR = 60 * 60 * 24 * 365;

// Options for the server-set preview cookies; httpOnly varies per cookie.
export const COOKIE_OPTS = {
  sameSite: "lax",
  secure: true,
  path: "/",
  maxAge: YEAR,
} as const;

// sha256 hex of the preview secret — the AUTH_COOKIE value. Memoized: the
// secret never changes within a process.
let cachedToken: { secret: string; token: string } | undefined;
export async function previewToken(secret: string): Promise<string> {
  if (cachedToken?.secret !== secret) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(secret),
    );
    const token = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    cachedToken = { secret, token };
  }
  return cachedToken.token;
}

// Whether community is on for a browser presenting this AUTH_COOKIE value:
// publicly enabled, or a valid owner-preview cookie. Takes the cookie value
// as a parameter (instead of reading next/headers) so the edge middleware and
// the node runtime share the exact same gate — the /c page 404ing while the
// middleware still redirects to it is the dead-end this prevents.
export async function communityAllowed(
  authCookie: string | undefined,
): Promise<boolean> {
  if (process.env.COMMUNITY_ENABLED === "true") return true;
  const secret = process.env.COMMUNITY_PREVIEW_SECRET;
  if (!secret || !authCookie) return false;
  return authCookie === (await previewToken(secret));
}
