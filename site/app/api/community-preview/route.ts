import { cookies, draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  COOKIE_OPTS,
  MARKER_COOKIE,
  previewToken,
  VIEW_COOKIE,
} from "@/lib/preview";

// Owner-only preview switch for the community view (VocabCards #288 / #275).
// GET /api/community-preview?key=<COMMUNITY_PREVIEW_SECRET> turns community on
// for THIS browser only: a year-long httpOnly auth cookie (the authoritative
// gate the /c route and the middleware check — see lib/preview.ts) plus a
// readable marker cookie the classic page uses to reveal the toggle
// client-side without going dynamic. ?key=off clears everything, including
// the sticky view choice. Anyone without the auth cookie still gets a 404 on
// /c and no toggle. Delete this route (and the flag wiring) on public launch.

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const jar = await cookies();

  if (key === "off") {
    // Also clear any lingering Draft Mode cookie from the pre-#20 scheme.
    (await draftMode()).disable();
    jar.delete(AUTH_COOKIE);
    jar.delete(MARKER_COOKIE);
    jar.delete(VIEW_COOKIE);
    return NextResponse.redirect(new URL("/", req.url));
  }

  const secret = process.env.COMMUNITY_PREVIEW_SECRET;
  if (!secret || key !== secret) {
    // Don't confirm the route exists to a wrong/absent key.
    return new NextResponse("Not found", { status: 404 });
  }

  jar.set(AUTH_COOKIE, await previewToken(secret), {
    ...COOKIE_OPTS,
    httpOnly: true,
  });
  jar.set(MARKER_COOKIE, "1", { ...COOKIE_OPTS, httpOnly: false });
  return NextResponse.redirect(new URL("/", req.url));
}
