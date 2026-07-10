import { cookies } from "next/headers";

// Public launch switch for the community view (server-only env var, matching
// lib/api.ts's env convention). Off by default; flip COMMUNITY_ENABLED to
// "true" at launch. Paired with an owner-preview path below.
export function communityPublic(): boolean {
  return process.env.COMMUNITY_ENABLED === "true";
}

// The owner-preview gate cookie: httpOnly, holds a hash of
// COMMUNITY_PREVIEW_SECRET, set by /api/community-preview. We deliberately do
// NOT use Next Draft Mode here: its bypass cookie is a session cookie whose
// value is tied to the build's previewModeId, so every deploy (and every
// browser restart) silently killed the preview while the year-long marker
// cookie kept showing the toggle. This cookie survives both. Remove this
// whole file when community goes public.
export const AUTH_COOKIE = "vc_community_auth";

// Non-httpOnly sibling cookie, read client-side by ClassicCommunityToggle to
// reveal the toggle on the static classic page without going dynamic.
export const MARKER_COOKIE = "vc_community_preview";

export async function previewToken(): Promise<string | null> {
  const secret = process.env.COMMUNITY_PREVIEW_SECRET;
  if (!secret) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Whether the community view should render for THIS request: publicly
// enabled, or an owner preview (auth cookie matching the current secret).
// Server-only — it reads cookies(), which opts the caller into dynamic
// rendering, so only call it from the already force-dynamic /c route, never
// from the ISR classic page (that reveals the toggle client-side instead).
export async function communityVisible(): Promise<boolean> {
  if (communityPublic()) return true;
  const token = await previewToken();
  if (!token) return false;
  try {
    return (await cookies()).get(AUTH_COOKIE)?.value === token;
  } catch {
    return false;
  }
}
