import { cookies, draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

// Owner-only preview switch for the community view (VocabCards #288 / #275).
// GET /api/community-preview?key=<COMMUNITY_PREVIEW_SECRET> turns community on
// for THIS browser only: it enables Next Draft Mode (the authoritative,
// httpOnly cookie the /c route checks) plus a readable marker cookie the
// classic page uses to reveal the toggle client-side without going dynamic.
// ?key=off clears both. Anyone without the draft cookie still gets a 404 on
// /c and no toggle. Delete this route (and the flag wiring) on public launch.
const MARKER = "vc_community_preview";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const dm = await draftMode();
  const jar = await cookies();

  if (key === "off") {
    dm.disable();
    jar.delete(MARKER);
    return NextResponse.redirect(new URL("/", req.url));
  }

  const secret = process.env.COMMUNITY_PREVIEW_SECRET;
  if (!secret || key !== secret) {
    // Don't confirm the route exists to a wrong/absent key.
    return new NextResponse("Not found", { status: 404 });
  }

  dm.enable();
  jar.set(MARKER, "1", {
    httpOnly: false, // read by the client toggle; a marker, not a credential
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.redirect(new URL("/", req.url));
}
