"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Couldn’t send your feedback. Please try again later.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="feedback-done" role="status">
        <p className="feedback-done-emoji">🎉</p>
        <h2>Thank you!</h2>
        <p>
          Your feedback is on its way. If you left an email, we’ll get back to
          you.
        </p>
      </div>
    );
  }

  return (
    <form className="feedback-form" onSubmit={handleSubmit}>
      <label htmlFor="feedback-message">Your message</label>
      <textarea
        id="feedback-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Found a bug, love a card, want a new language pair? Tell us anything."
        rows={7}
        maxLength={1800}
        required
      />

      <label htmlFor="feedback-email">Email (optional, so we can reply)</label>
      <input
        id="feedback-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
      />

      {status === "error" && (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={!message.trim() || status === "sending"}>
        {status === "sending" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
