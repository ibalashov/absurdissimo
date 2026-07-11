"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { absurdityLabel, formatDate, imageUrl } from "@/lib/api";
import { clearAuth } from "@/lib/auth";
import Avatar from "./Avatar";
import MnemonicText from "./MnemonicText";
import { GoogleSignInButton, HandlePrompt, useAuth } from "./CommunityAuth";
import {
  addComment,
  castVote,
  CommunityEntry,
  fetchThread,
  profilePath,
  sortEntries,
  submitEntry,
} from "@/lib/community";

// Author handle, as a profile link when the author is an account (#317);
// plain text for AI entries and legacy anonymous authors (author_id null).
// Account authors also get their avatar disc (#330/#331) — rendered only when
// the payload actually carries one, so pre-#330 responses stay avatar-free.
function AuthorHandle({
  handle,
  authorId,
  avatar,
  className,
}: {
  handle: string;
  authorId: number | null;
  avatar?: string | null;
  className: string;
}) {
  if (authorId === null) return <span className={className}>{handle}</span>;
  return (
    <Link className={className} href={profilePath(authorId, handle)}>
      {typeof avatar === "string" && (
        <Avatar emoji={avatar} accountId={authorId} size="sm" />
      )}
      {handle}
    </Link>
  );
}

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
  const [error, setError] = useState<string | null>(null);
  // Comments require sign-in (#307); when signed out the opened panel shows
  // the sign-in affordance instead of the textarea, and flips to the form the
  // moment the exchange succeeds. Voting stays anonymous and untouched.
  const { token } = useAuth();

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(entry.id, body);
      setText("");
      setOpen(false);
    } catch (e) {
      // Don't swallow: show why the comment was rejected (network, or once
      // server moderation lands, a length/rate-limit/profanity error).
      setError(e instanceof Error ? e.message : "Could not post — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="comments">
      {entry.comments.map((c) => (
        <div className="comment" key={c.id}>
          <AuthorHandle
            className="cwho"
            handle={c.author_handle}
            authorId={c.author_id}
            avatar={c.avatar}
          />
          <span>{c.body}</span>
        </div>
      ))}
      {open && !token ? (
        <div className="comment-form comment-signin">
          <p className="signin-hint">Sign in with Google to contribute a comment.</p>
          <GoogleSignInButton />
          <div className="comment-form-actions">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : open ? (
        <div className="comment-form">
          <textarea
            rows={2}
            value={text}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
          />
          {error && <p className="submit-error">{error}</p>}
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
  hero,
  onVote,
  onComment,
}: {
  entry: CommunityEntry;
  word: string;
  // The first entry of the current sort renders SO-answer style: full-size
  // image and story instead of a thumbnail row.
  hero: boolean;
  onVote: (entry: CommunityEntry, dir: 1 | -1) => void;
  onComment: (entryId: number, body: string) => Promise<void>;
}) {
  return (
    <li className={`assoc${entry.is_pick ? " picked" : ""}${hero ? " hero" : ""}`}>
      <VoteRail entry={entry} onVote={onVote} />
      <div className="assoc-body">
        <div className="assoc-top">
          {entry.image_id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="thumb"
              src={imageUrl(entry.image_id)}
              alt={`Illustration of the mnemonic for ${word}`}
              loading={hero ? "eager" : "lazy"}
            />
          ) : (
            <div className="thumb placeholder" aria-hidden="true">
              ✎
            </div>
          )}
          <div className="assoc-text">
            <p className="mnemonic" dir="auto">
              <MnemonicText text={entry.mnemonic} keyword={entry.keyword} />
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
          {entry.kind === "ai" || entry.author_handle === null ? (
            <span className="badge-ai">AI-generated</span>
          ) : (
            <AuthorHandle
              className="who"
              handle={entry.author_handle}
              authorId={entry.author_id}
              avatar={entry.avatar}
            />
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
  initialEntries: CommunityEntry[];
}) {
  const [entries, setEntries] = useState<CommunityEntry[]>(initialEntries);
  const [sort, setSort] = useState<"top" | "newest">("top");

  // Submissions require sign-in (#307): signed out, the composer is replaced
  // by the Google sign-in affordance. Votes stay anonymous (device-id only).
  // Composer drafts live here in the parent, so a mid-draft 401 (token
  // expired → clearAuth) swaps the form for the sign-in gate without losing
  // the text — it comes back after re-sign-in.
  const auth = useAuth();

  // Composer state.
  const [composerOpen, setComposerOpen] = useState(false);
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
      setComposerOpen(false);
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
          {ordered.map((entry, i) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              word={word}
              hero={i === 0}
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

      {!auth.token ? (
        <div className="composer-cta signin-gate">
          <p>
            <strong>Know a better one?</strong>{" "}
            <span className="hint">
              Sign in with Google to contribute your own mnemonic — the
              community votes, and the best becomes the pick. Voting stays
              anonymous.
            </span>
          </p>
          <GoogleSignInButton />
        </div>
      ) : !composerOpen ? (
        <>
          {auth.needsHandle && <HandlePrompt placeholder={auth.handle} />}
          <div className="composer-cta">
            <p>
              <strong>Know a better one?</strong>{" "}
              <span className="hint">
                Post your own mnemonic — the community votes, and the best
                becomes the pick.
              </span>
            </p>
            <button className="submit" onClick={() => setComposerOpen(true)}>
              Suggest your own association
            </button>
          </div>
        </>
      ) : (
        <>
          {auth.needsHandle && <HandlePrompt placeholder={auth.handle} />}
      <form className="composer" onSubmit={onSubmit}>
        <h3>Suggest your own association</h3>
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
          <p className="guideline">
            Keep it about this word. Be kind and constructive.
            {auth.handle && (
              <>
                {" "}
                Posting as <b>{auth.handle}</b> ·{" "}
                <button type="button" className="signout" onClick={clearAuth}>
                  sign out
                </button>
              </>
            )}
          </p>
          <div className="composer-actions">
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setComposerOpen(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button className="submit" type="submit" disabled={submitting || !mnemonic.trim()}>
              {submitting ? "Posting…" : "Post association"}
            </button>
          </div>
        </div>
      </form>
        </>
      )}
    </>
  );
}
