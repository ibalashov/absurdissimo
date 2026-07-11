"use client";

// Own-view panel for the community profile page (VocabCards #317): shown only
// when the signed-in account (from /auth/me) is the profile being viewed.
// Google email (own-view only — never in the public payload), sign-out, and a
// rename-handle form following the HandlePrompt validation/error pattern
// (client-side format check, inline 400/409 from the server, busy state).
// Renames are cheap because profile URLs are keyed by the stable account id;
// on success we just hop to the new canonical slug.

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { chooseHandle, clearAuth } from "@/lib/auth";
import { profilePath } from "@/lib/community";
import { useMe } from "./CommunityAuth";

export default function ProfileOwnPanel({ profileId }: { profileId: number }) {
  const me = useMe();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  if (!me || me.id !== profileId) return null;

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!me || busy) return;
    const chosen = handle.trim();
    if (chosen === me.handle) {
      setRenaming(false);
      return;
    }
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(chosen)) {
      setError("Handles are 3–20 letters, digits, hyphens, or underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await chooseHandle(chosen);
      setRenaming(false);
      setHandle("");
      // The old slug no longer matches and would bounce through the server
      // redirect — go straight to the new canonical URL.
      router.replace(profilePath(profileId, chosen));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="own-panel" aria-label="Your account">
      <div className="own-row">
        <p className="own-id">
          This is you — signed in as <b>{me.email ?? me.handle}</b>.{" "}
          <span className="own-note">Only you can see the email.</span>
        </p>
        <div className="own-actions">
          {!renaming && (
            <button
              className="btn-ghost"
              type="button"
              onClick={() => {
                setHandle(me.handle);
                setError(null);
                setRenaming(true);
              }}
            >
              Rename handle
            </button>
          )}
          <button className="btn-ghost" type="button" onClick={clearAuth}>
            Sign out
          </button>
        </div>
      </div>
      {renaming && (
        <form className="rename-form" onSubmit={onRename}>
          <div className="field">
            <label htmlFor="rename-handle">New handle</label>
            <input
              id="rename-handle"
              type="text"
              value={handle}
              placeholder="3–20 letters, digits, - or _"
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setHandle(e.target.value)}
            />
          </div>
          {error && <p className="submit-error">{error}</p>}
          <div className="handle-actions">
            <button
              className="btn-ghost"
              type="button"
              onClick={() => setRenaming(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn-small"
              type="submit"
              disabled={busy || !handle.trim()}
            >
              {busy ? "Saving…" : "Save handle"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
