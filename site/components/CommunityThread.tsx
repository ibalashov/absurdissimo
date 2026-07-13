"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { absurdityLabel, formatDate, formatDateTime, imageUrl, timeAgo } from "@/lib/api";
import { clearAuth } from "@/lib/auth";
import Avatar from "./Avatar";
import InlineMarkup from "./InlineMarkup";
import MnemonicText from "./MnemonicText";
import { hideAdminCard } from "@/lib/admin";
import {
  GoogleSignInButton,
  HandlePrompt,
  useAuth,
  useIsAdmin,
  useMe,
} from "./CommunityAuth";
import {
  addComment,
  castVote,
  CommunityComment,
  CommunityEntry,
  deleteComment,
  fetchThread,
  profilePath,
  sortEntries,
  submitEntry,
  updateComment,
  updateEntry,
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

// One comment row. The owner (#333) gets quiet edit/delete affordances: edit
// swaps the body for the same textarea the add-form uses; delete is a
// two-step inline confirm — no modal, matching the low-ceremony comment UI.
function CommentItem({
  comment,
  mine,
  onEdit,
  onDelete,
}: {
  comment: CommunityComment;
  mine: boolean;
  onEdit: (commentId: number, body: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onEdit(comment.id, body);
      setEditing(false);
    } catch (e) {
      // Same rule as posting: surface the server's actionable message
      // (length/rate-limit/moderation) instead of swallowing it.
      setError(e instanceof Error ? e.message : "Could not save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(comment.id);
      // No state reset: the parent drops this row on success.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete — try again.");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (editing) {
    return (
      <div className="comment editing">
        <div className="comment-form">
          <textarea
            rows={2}
            value={text}
            aria-label="Edit your comment"
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
          />
          {error && <p className="submit-error">{error}</p>}
          <div className="comment-form-actions">
            <button
              className="btn-ghost"
              onClick={() => {
                setEditing(false);
                setText(comment.body);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="btn-small" onClick={save} disabled={busy || !text.trim()}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="comment">
      <AuthorHandle
        className="cwho"
        handle={comment.author_handle}
        authorId={comment.author_id}
        avatar={comment.avatar}
      />
      <span>
        <InlineMarkup text={comment.body} />
        {comment.updated_at && (
          <span
            className="edited"
            title={`Edited ${formatDateTime(comment.updated_at)}`}
            suppressHydrationWarning
          >
            {" "}
            (edited {timeAgo(comment.updated_at)})
          </span>
        )}
        {error && <span className="submit-error"> {error}</span>}
      </span>
      {mine && (
        <span className="own-actions">
          {confirming ? (
            <>
              <button className="own-action danger" onClick={remove} disabled={busy}>
                {busy ? "deleting…" : "really delete?"}
              </button>
              <button className="own-action" onClick={() => setConfirming(false)} disabled={busy}>
                keep
              </button>
            </>
          ) : (
            <>
              <button
                className="own-action"
                onClick={() => {
                  setText(comment.body);
                  setError(null);
                  setEditing(true);
                }}
              >
                edit
              </button>
              <button className="own-action danger" onClick={() => setConfirming(true)}>
                delete
              </button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

function CommentList({
  entry,
  meId,
  onAdd,
  onEdit,
  onDelete,
}: {
  entry: CommunityEntry;
  meId: number | null;
  onAdd: (entryId: number, body: string) => Promise<void>;
  onEdit: (entryId: number, commentId: number, body: string) => Promise<void>;
  onDelete: (entryId: number, commentId: number) => Promise<void>;
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
        <CommentItem
          key={c.id}
          comment={c}
          mine={meId !== null && c.author_id === meId}
          onEdit={(commentId, body) => onEdit(entry.id, commentId, body)}
          onDelete={(commentId) => onDelete(entry.id, commentId)}
        />
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
  mine,
  isAdmin,
  onVote,
  onComment,
  onEdit,
  onEditComment,
  onDeleteComment,
  onHide,
  meId,
}: {
  entry: CommunityEntry;
  word: string;
  // The first entry of the current sort renders SO-answer style: full-size
  // image and story instead of a thumbnail row.
  hero: boolean;
  // The signed-in account owns this entry (#333) — only then the edit
  // affordance shows (and only user entries carry an owner; AI never).
  mine: boolean;
  // Allowlisted admin (#390): unlocks the inline hide on AI cards.
  isAdmin: boolean;
  onVote: (entry: CommunityEntry, dir: 1 | -1) => void;
  onComment: (entryId: number, body: string) => Promise<void>;
  onEdit: (
    entryId: number,
    fields: { keyword?: string; mnemonic: string; explanation?: string },
  ) => Promise<void>;
  onEditComment: (entryId: number, commentId: number, body: string) => Promise<void>;
  onDeleteComment: (entryId: number, commentId: number) => Promise<void>;
  onHide: (entry: CommunityEntry) => Promise<void>;
  meId: number | null;
}) {
  // Owner edit (#333): the text block swaps for the composer's field trio;
  // drafts seed from the entry on open so a cancelled edit changes nothing.
  const [editing, setEditing] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Admin hide (#390): a two-step inline confirm, matching the owner-delete
  // affordances elsewhere in the thread. Only AI cards qualify — they map to a
  // corpus row; user submissions are moderated separately.
  const [confirmingHide, setConfirmingHide] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const canHide =
    isAdmin && entry.kind === "ai" && entry.association_id != null;

  async function doHide() {
    if (hiding) return;
    setHiding(true);
    setHideError(null);
    try {
      await onHide(entry);
      // Parent drops the row on success — nothing to reset here.
    } catch (e) {
      setHideError(e instanceof Error ? e.message : "Could not hide — try again.");
      setHiding(false);
      setConfirmingHide(false);
    }
  }

  function startEdit() {
    setKeyword(entry.keyword ?? "");
    setMnemonic(entry.mnemonic);
    setExplanation(entry.explanation ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    const text = mnemonic.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onEdit(entry.id, {
        keyword: keyword.trim() || undefined,
        mnemonic: text,
        explanation: explanation.trim() || undefined,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save — try again.");
    } finally {
      setBusy(false);
    }
  }

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
          {editing ? (
            <div className="assoc-text entry-edit">
              <div className="field">
                <label htmlFor={`edit-kw-${entry.id}`}>Sound-alike keyword</label>
                <input
                  id={`edit-kw-${entry.id}`}
                  type="text"
                  value={keyword}
                  maxLength={120}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`edit-mn-${entry.id}`}>Your mnemonic</label>
                <textarea
                  id={`edit-mn-${entry.id}`}
                  rows={3}
                  value={mnemonic}
                  maxLength={500}
                  onChange={(e) => setMnemonic(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor={`edit-ex-${entry.id}`}>Why it works (optional)</label>
                <textarea
                  id={`edit-ex-${entry.id}`}
                  rows={2}
                  value={explanation}
                  maxLength={1000}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </div>
              {error && <p className="submit-error">{error}</p>}
              <div className="comment-form-actions">
                <button className="btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </button>
                <button className="btn-small" onClick={save} disabled={busy || !mnemonic.trim()}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="assoc-text">
              <p className="mnemonic" dir="auto">
                <MnemonicText text={entry.mnemonic} keyword={entry.keyword} />
              </p>
              {entry.explanation && (
                <p className="explanation">
                  <InlineMarkup text={entry.explanation} />
                </p>
              )}
              <div className="chips">
                {entry.is_pick && <span className="chip pick">✓ Community pick</span>}
                {entry.keyword && <span className="chip key">keyword · {entry.keyword}</span>}
                {entry.absurdity && <span className="chip">{absurdityLabel(entry.absurdity)}</span>}
              </div>
            </div>
          )}
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
          {entry.updated_at && (
            <span
              className="edited"
              title={`Edited ${formatDateTime(entry.updated_at)}`}
              suppressHydrationWarning
            >
              (edited {timeAgo(entry.updated_at)})
            </span>
          )}
          {mine && entry.kind === "user" && !editing && (
            <>
              <span className="dot">·</span>
              <button className="own-action" onClick={startEdit}>
                edit
              </button>
            </>
          )}
          {canHide && !editing && (
            <>
              <span className="dot">·</span>
              {confirmingHide ? (
                <>
                  <button
                    className="own-action danger"
                    onClick={doHide}
                    disabled={hiding}
                  >
                    {hiding ? "hiding…" : "confirm hide"}
                  </button>
                  <button
                    className="own-action"
                    onClick={() => setConfirmingHide(false)}
                    disabled={hiding}
                  >
                    cancel
                  </button>
                </>
              ) : (
                <button
                  className="own-action danger"
                  onClick={() => setConfirmingHide(true)}
                  title="Hide this card — inappropriate or broken; reversible (admin)"
                >
                  hide card
                </button>
              )}
              {hideError && <span className="submit-error"> {hideError}</span>}
            </>
          )}
        </div>
        <CommentList
          entry={entry}
          meId={meId}
          onAdd={onComment}
          onEdit={onEditComment}
          onDelete={onDeleteComment}
        />
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
  // Owner affordances (#333): items whose author_id matches the signed-in
  // account id get edit/delete controls. Loads client-side after mount, so
  // the SSR pass renders none (no hydration mismatch) and they fade in.
  const me = useMe();
  const meId = me?.id ?? null;
  // Allowlisted admins get an inline force-delete on AI cards (#390). Resolves
  // client-side after mount, like useMe — SSR renders none.
  const isAdmin = useIsAdmin();

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

  // Owner mutations (#333): no optimism — the row updates only from the
  // server's response, and errors stay in the inline form that raised them.
  async function onEditComment(entryId: number, commentId: number, body: string) {
    const updated = await updateComment(commentId, body);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, comments: e.comments.map((c) => (c.id === commentId ? updated : c)) }
          : e,
      ),
    );
  }

  async function onDeleteComment(entryId: number, commentId: number) {
    await deleteComment(commentId);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, comments: e.comments.filter((c) => c.id !== commentId) }
          : e,
      ),
    );
  }

  // Admin hide (#390): reversibly retires the corpus card server-side (and
  // hides this very entry + unpins it from the starter pack), so drop it from
  // the thread. Errors surface in the card's inline control.
  async function onHide(entry: CommunityEntry) {
    if (entry.association_id == null) return;
    await hideAdminCard(entry.association_id, pair);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  async function onEditEntry(
    entryId: number,
    fields: { keyword?: string; mnemonic: string; explanation?: string },
  ) {
    // The PATCH response is the full thread-shaped entry (score, comments,
    // is_pick), so replacing wholesale keeps everything consistent.
    const updated = await updateEntry(entryId, fields);
    replaceEntry(entryId, updated);
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
              mine={meId !== null && entry.author_id === meId}
              isAdmin={isAdmin}
              meId={meId}
              onVote={onVote}
              onComment={onComment}
              onEdit={onEditEntry}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              onHide={onHide}
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
