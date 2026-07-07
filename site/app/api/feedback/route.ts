import { NextResponse } from "next/server";

// Server-side feedback relay. The browser posts here (same origin, no CORS,
// no secret exposed); this route forwards to the VocabCards server's existing
// POST /feedback using the app secret, which stores the message and fires the
// `feedback_submitted` PostHog event that already emails Ivan via an alert.
//
// APP_SECRET must be set in the Vercel project env (same value as the server's
// Fly `APP_SECRET` secret). Without it the route reports "not configured".

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://vocabcards-server.fly.dev";

// The server caps `comments` at 2000 chars; keep some headroom for the folded
// reply-to line so a long-but-valid message isn't rejected upstream.
const MAX_MESSAGE = 1800;

export async function POST(request: Request) {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Feedback isn’t configured yet. Please try again later." },
      { status: 503 },
    );
  }

  let payload: { message?: unknown; email?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Please enter a message." },
      { status: 400 },
    );
  }

  // Fold the optional reply-to email into the comment: the existing feedback
  // schema/event has no email field, and this keeps it visible in feedback.db
  // and the PostHog event without a server change.
  const trimmed = message.slice(0, MAX_MESSAGE);
  const comments = email ? `${trimmed}\n\nReply-to: ${email}` : trimmed;

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Secret": secret,
      },
      body: JSON.stringify({ comments, app_version: "web" }),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn’t reach the server. Please try again later." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Couldn’t send your feedback. Please try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
