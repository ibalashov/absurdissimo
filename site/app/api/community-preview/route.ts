import { cookies, draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, MARKER_COOKIE, previewToken } from "@/lib/flags";

// Owner-only preview switch for the community view (VocabCards #288 / #275).
// GET /api/community-preview?key=<COMMUNITY_PREVIEW_SECRET> turns community on
// for THIS browser only: it sets a year-long httpOnly auth cookie (a hash of
// the secret — the authoritative gate the /c route checks, deploy- and
// restart-proof, unlike the Draft Mode cookie it replaced) plus a readable
// marker cookie the classic page uses to reveal the toggle client-side
// without going dynamic. ?key=off clears everything, including the sticky
// view choice. Anyone without the auth cookie still gets a 404 on /c and no
// toggle. Delete this route (and the flag wiring) on public launch.

const YEAR = 60 * 60 * 24 * 365;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const jar = await cookies();

  if (key === "off") {
    // Also clear any lingering Draft Mode cookie from the previous scheme.
    (await draftMode()).disable();
    jar.delete(AUTH_COOKIE);
    jar.delete(MARKER_COOKIE);
    jar.delete("vc_view");
    return NextResponse.redirect(new URL("/", req.url));
  }

  const secret = process.env.COMMUNITY_PREVIEW_SECRET;
  if (!secret || key !== secret) {
    // Don't confirm the route exists to a wrong/absent key.
    return new NextResponse("Not found", { status: 404 });
  }

  jar.set(AUTH_COOKIE, (await previewToken())!, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: YEAR,
  });
  jar.set(MARKER_COOKIE, "1", {
    httpOnly: false, // read by the client toggle; a marker, not a credential
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: YEAR,
  });
  return NextResponse.redirect(new URL("/", req.url));
}
