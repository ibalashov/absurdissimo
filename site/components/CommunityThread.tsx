"use client";

import { type FormEvent, useEffect, useState } from "react";
import { absurdityLabel, formatDate, imageUrl } from "@/lib/api";
import {
  addComment,
  castVote,
  CommunityEntry,
  fetchThread,
  sortEntries,
  submitEntry,
} from "@/lib/community";

function VoteRail({
  entry,
  onVote,
}: {
  entry: CommunityEntry;
  onVote: (entry: CommunityEntry, dir: 1 | -1) => void;
}) {
  return (
    <div className="rail">
      <button
        className={`vote up${entry.your_vote === 1 ? " on" : ""}`}
        aria-label="Upvote"
        aria-pressed={entry.your_vote === 1}
        onClick={() => onVote(entry, 1)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5l7 8H5z" />
        </svg>
      </button>
      <span className="score">{entry.score}</span>
      <button
        className={`vote down${entry.your_vote === -1 ? " on" : ""}`}
        aria-label="Downvote"
        aria-pressed={entry.your_vote === -1}
        onClick={() => onVote(entry, -1)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19l7-8H5z" />
        </svg>
      </button>
      {entry.is_pick && (
        <span className="pick-check" title="Community pick" aria-label="Community pick">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
      )}
    </div>
  );
}

function CommentList({
  entry,
  onAdd,
}: {
  entry: CommunityEntry;
  onAdd: (entryId: number, body: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onAdd(entry.id, body);
      setText("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="comments">
      {entry.comments.map((c) => (
        <div className="comment" key={c.id}>
          <span className="cwho">{c.author_handle}</span>
          <span>{c.body}</span>
        </div>
      ))}
      {open ? (
        <div className="comment-form">
          <textarea
            rows={2}
            value={text}
            placeholder="Add a comment…"
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
          />
          <div className="comment-form-actions">
            <button className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-small" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      ) : (
        <button className="comment-add" onClick={() => setOpen(true)}>
          + add a comment
        </button>
      )}
    </div>
  );
}

function EntryCard({
  entry,
  word,
  onVote,
  onComment,
}: {
  entry: CommunityEntry;
  word: string;
  onVote: (entry: CommunityEntry, dir: 1 | -1) => void;
  onComment: (entryId: number, body: string) => Promise<void>;
}) {
  return (
    <li className={`assoc${entry.is_pick ? " picked" : ""}`}>
      <VoteRail entry={entry} onVote={onVote} />
      <div className="assoc-body">
        <div className="assoc-top">
          {entry.image_id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="thumb"
              src={imageUrl(entry.image_id)}
              alt={`Illustration of the mnemonic for ${word}`}
              loading="lazy"
            />
          ) : (
            <div className="thumb placeholder" aria-hidden="true">
              ✎
            </div>
          )}
          <div className="assoc-text">
            <p className="mnemonic" dir="auto">
              {entry.mnemonic}
            </p>
            {entry.explanation && <p className="explanation">{entry.explanation}</p>}
            <div className="chips">
              {entry.is_pick && <span className="chip pick">✓ Community pick</span>}
              {entry.keyword && <span className="chip key">keyword · {entry.keyword}</span>}
              {entry.absurdity && <span className="chip">{absurdityLabel(entry.absurdity)}</span>}
            </div>
          </div>
        </div>
        <div className="assoc-meta">
          {entry.kind === "ai" ? (
            <span className="badge-ai">AI-generated</span>
          ) : (
            <span className="who">{entry.author_handle}</span>
          )}
          <span className="dot">·</span>
          <span>{formatDate(entry.created_at)}</span>
        </div>
        <CommentList entry={entry} onAdd={onComment} />
      </div>
    </li>
  );
}

export default function CommunityThread({
  pair,
  word,
  initialEntries,
}: {
  pair: string;
  word: string;
  displayWord: string;
  initialEntries: CommunityEntry[];
}) {
  const [entries, setEntries] = useState<CommunityEntry[]>(initialEntries);
  const [sort, setSort] = useState<"top" | "newest">("top");

  // Composer state.
  const [keyword, setKeyword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Re-fetch under the visitor's real device id so their own votes light up
  // (the SSR pass rendered content under a neutral id, your_vote all 0).
  useEffect(() => {
    let cancelled = false;
    fetchThread(pair, word)
      .then((t) => {
        if (!cancelled) setEntries(t.entries);
      })
      .catch(() => {
        /* keep the server-rendered entries */
      });
    return () => {
      cancelled = true;
    };
  }, [pair, word]);

  function replaceEntry(id: number, next: Partial<CommunityEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...next } : e)));
  }

  async function onVote(entry: CommunityEntry, dir: 1 | -1) {
    const value = entry.your_vote === dir ? 0 : dir;
    // Optimistic: adjust score by the delta between old and new vote.
    replaceEntry(entry.id, {
      your_vote: value,
      score: entry.score - entry.your_vote + value,
    });
    try {
      const r = await castVote(entry.id, value);
      replaceEntry(entry.id, { your_vote: r.your_vote, score: r.score });
    } catch {
      replaceEntry(entry.id, { your_vote: entry.your_vote, score: entry.score });
    }
  }

  async function onComment(entryId: number, body: string) {
    const comment = await addComment(entryId, body);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, comments: [...e.comments, comment] } : e,
      ),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = mnemonic.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await submitEntry(pair, word, {
        keyword: keyword.trim() || undefined,
        mnemonic: text,
        explanation: explanation.trim() || undefined,
      });
      setEntries((prev) => [...prev, created]);
      setKeyword("");
      setMnemonic("");
      setExplanation("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not post — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const ordered = sortEntries(entries, sort);

  return (
    <>
      <div className="toolbar">
        <h2>
          <span className="n">{entries.length}</span>{" "}
          {entries.length === 1 ? "way people remember this" : "ways people remember this"}
        </h2>
        <div className="sorts" role="tablist" aria-label="Sort associations">
          <button
            className={sort === "top" ? "on" : ""}
            role="tab"
            aria-selected={sort === "top"}
            onClick={() => setSort("top")}
          >
            Top
          </button>
          <button
            className={sort === "newest" ? "on" : ""}
            role="tab"
            aria-selected={sort === "newest"}
            onClick={() => setSort("newest")}
          >
            Newest
          </button>
        </div>
      </div>

      {ordered.length > 0 ? (
        <ul className="assoc-list">
          {ordered.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              word={word}
              onVote={onVote}
              onComment={onComment}
            />
          ))}
        </ul>
      ) : (
        <p className="empty-thread">
          No associations yet — be the first to add one below.
        </p>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <h3>Suggest your own association</h3>
        <p className="lead">
          Got a sound-alike or picture that works better? Post it — the community
          votes, and the highest-scoring one becomes the pick shown first.
        </p>
        <div className="field">
          <label htmlFor="kw">Sound-alike keyword</label>
          <input
            id="kw"
            type="text"
            value={keyword}
            placeholder="the English word(s) it sounds like"
            maxLength={120}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="mn">Your mnemonic</label>
          <textarea
            id="mn"
            rows={3}
            value={mnemonic}
            placeholder="One vivid sentence linking the keyword to the meaning…"
            maxLength={500}
            onChange={(e) => setMnemonic(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="ex">Why it works (optional)</label>
          <textarea
            id="ex"
            rows={2}
            value={explanation}
            placeholder="A line on the sound match or the mental image."
            maxLength={1000}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </div>
        {submitError && <p className="submit-error">{submitError}</p>}
        <div className="composer-foot">
          <p className="guideline">Keep it about this word. Be kind and constructive.</p>
          <button className="submit" type="submit" disabled={submitting || !mnemonic.trim()}>
            {submitting ? "Posting…" : "Post association"}
          </button>
        </div>
      </form>
    </>
  );
}
