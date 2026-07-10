import { draftMode } from "next/headers";

// Public launch switch for the community view (server-only env var, matching
// lib/api.ts's env convention). Off by default; flip COMMUNITY_ENABLED to
// "true" at launch. Paired with an owner-preview path below.
export function communityPublic(): boolean {
  return process.env.COMMUNITY_ENABLED === "true";
}

// Whether the community view should render for THIS request: publicly enabled,
// or an owner preview via Next Draft Mode (turned on through
// /api/community-preview behind COMMUNITY_PREVIEW_SECRET). Server-only — it
// reads draftMode(), which opts the caller into dynamic rendering, so only
// call it from the already force-dynamic /c route, never from the ISR classic
// page (that reveals the toggle client-side instead). Remove this whole file
// when community goes public.
export async function communityVisible(): Promise<boolean> {
  if (communityPublic()) return true;
  try {
    return (await draftMode()).isEnabled;
  } catch {
    return false;
  }
}
