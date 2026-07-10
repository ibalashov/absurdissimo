import { cookies } from "next/headers";
import { AUTH_COOKIE, communityAllowed } from "./preview";

// Whether the community view should render for THIS request: publicly
// enabled (COMMUNITY_ENABLED), or an owner preview (auth cookie set by
// /api/community-preview matching the current secret — see lib/preview.ts).
// Server-only — it reads cookies(), which opts the caller into dynamic
// rendering, so only call it from the already force-dynamic /c route, never
// from the ISR classic page (that reveals the toggle client-side instead).
// Remove this file when community goes public.
export async function communityVisible(): Promise<boolean> {
  try {
    return await communityAllowed((await cookies()).get(AUTH_COOKIE)?.value);
  } catch {
    return false;
  }
}
