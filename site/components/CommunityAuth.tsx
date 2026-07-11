"use client";

// Google Identity Services (GIS) wiring for the community view (VocabCards
// #307). Only /c/* components import this file, so the GIS script never loads
// on the static classic pages — it is injected lazily on first button mount,
// not via a layout <Script>. The Google credential is exchanged immediately
// for the server's own bearer token (lib/auth.ts); nothing Google-issued is
// stored.

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type AuthState,
  type Me,
  chooseHandle,
  ensureMe,
  getAuthState,
  getMe,
  getServerAuthState,
  getServerMe,
  signInWithGoogle,
  skipHandlePrompt,
  subscribeAuth,
} from "@/lib/auth";
import { profilePath } from "@/lib/community";
import Avatar from "./Avatar";

// The Google OAuth client id is a public identifier (it ships in every page
// that renders the button), safe to commit; the env var exists only for
// overriding in local experiments. NOTE: Google only serves sign-in to the
// client's authorized JavaScript origins — the production site and localhost
// — so Vercel preview deployments show the signed-out state only.
const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
  "372840551207-fkcou8hrtji38uohsusg4ptnf901r4vp.apps.googleusercontent.com";

// --- minimal GIS typings (the official package would be a dependency for
// --- three calls) -----------------------------------------------------------

interface GsiId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
    },
  ): void;
  prompt(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

// --- script loading + one-time initialization -------------------------------

let gisPromise: Promise<GsiId> | null = null;

function loadGis(): Promise<GsiId> {
  if (!gisPromise) {
    gisPromise = new Promise<GsiId>((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        if (window.google?.accounts?.id) resolve(window.google.accounts.id);
        else reject(new Error("GIS loaded without google.accounts.id"));
      };
      script.onerror = () => {
        gisPromise = null; // allow a retry on the next mount
        reject(new Error("Failed to load the Google sign-in script"));
      };
      document.head.appendChild(script);
    });
  }
  return gisPromise;
}

// Exchange failures surface on every mounted sign-in button (usually one).
let signInError: string | null = null;
const errorListeners = new Set<() => void>();
function setSignInError(message: string | null): void {
  signInError = message;
  for (const listener of errorListeners) listener();
}

let initialized = false;
function ensureInitialized(gsi: GsiId): void {
  if (initialized) return;
  initialized = true;
  gsi.initialize({
    client_id: GOOGLE_CLIENT_ID,
    use_fedcm_for_prompt: true,
    callback: (response) => {
      setSignInError(null);
      // Success flips the auth store; every subscribed component re-renders
      // signed-in, so there is no per-button success path to run here.
      signInWithGoogle(response.credential).catch((e) => {
        setSignInError(
          e instanceof Error ? e.message : "Sign-in failed — try again.",
        );
      });
    },
  });
}

// One Tap: at most once per page load, from the first sign-in affordance that
// mounts. Dismissals are additionally rate-limited by Google itself.
let oneTapShown = false;

// --- hooks + components ------------------------------------------------------

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
}

// The signed-in account from /auth/me (id, handle, email — VocabCards #317).
// null while signed out, and briefly on first render while the once-per-page
// fetch is in flight. Mounting any consumer kicks the fetch off.
export function useMe(): Me | null {
  const { token } = useAuth();
  const me = useSyncExternalStore(subscribeAuth, getMe, getServerMe);
  useEffect(() => {
    if (token) ensureMe();
  }, [token]);
  return me;
}

// Site-wide nav identity (VocabCards #337): the top-right slot on every page.
// Signed in: the visitor's handle chip linking to their profile (once
// /auth/me resolves — the profile URL needs the account id). Signed out: a
// Log in button revealing the Google button in a small popover. First paint
// renders the signed-out state (the auth store's server snapshot), matching
// the server HTML on ISR pages; the chip appears after hydration.
export function NavIdentity() {
  const [popOpen, setPopOpen] = useState(false);
  const me = useMe();
  const { token } = useAuth();
  if (me) {
    return (
      <Link className="id-chip" href={profilePath(me.id, me.handle)}>
        <Avatar emoji={me.avatar} accountId={me.id} size="sm" />
        {me.handle}
      </Link>
    );
  }
  if (token) return null; // signed in; chip appears when /auth/me resolves
  return (
    <div className="nav-login">
      <button
        className="nav-login-btn"
        onClick={() => setPopOpen((v) => !v)}
        aria-expanded={popOpen}
        aria-haspopup="dialog"
      >
        Log in
      </button>
      {popOpen && (
        <div className="nav-login-pop">
          <GoogleSignInButton />
        </div>
      )}
    </div>
  );
}

function useSignInError(): string | null {
  return useSyncExternalStore(
    (listener) => {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },
    () => signInError,
    () => null,
  );
}

// The official "Sign in with Google" button (plus the One Tap prompt on first
// mount). Renders a fixed-height host so the async button doesn't shift the
// page when it pops in.
export function GoogleSignInButton() {
  const host = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const exchangeError = useSignInError();

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then((gsi) => {
        if (cancelled || !host.current) return;
        ensureInitialized(gsi);
        gsi.renderButton(host.current, {
          theme: "filled_black",
          size: "large",
          text: "signin_with",
          shape: "pill",
        });
        if (!oneTapShown) {
          oneTapShown = true;
          gsi.prompt();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Google sign-in couldn't load — try again later.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const error = exchangeError ?? loadError;
  return (
    <div className="signin">
      <div className="signin-button" ref={host} aria-label="Sign in with Google" />
      {error && <p className="submit-error">{error}</p>}
    </div>
  );
}

// First-sign-in handle prompt, skippable (posts then carry the anon
// placeholder handle; the handle can be changed later from the profile page —
// #317). 409 "taken" and 400 validation errors surface inline and the user
// can retry.
export function HandlePrompt({ placeholder }: { placeholder: string | null }) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const chosen = handle.trim();
    if (busy) return;
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(chosen)) {
      setError("Handles are 3–20 letters, digits, hyphens, or underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await chooseHandle(chosen); // success updates the auth store → unmounts
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set handle.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer handle-prompt" onSubmit={onSubmit}>
      <h3>Pick your public handle</h3>
      <p className="lead">
        Shown next to your associations and comments. You can change it later
        from your profile page
        {placeholder ? <> — skip to keep posting as {placeholder}</> : null}.
      </p>
      <div className="field">
        <label htmlFor="handle">Handle</label>
        <input
          id="handle"
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
          onClick={skipHandlePrompt}
          disabled={busy}
        >
          Skip for now
        </button>
        <button className="btn-small" type="submit" disabled={busy || !handle.trim()}>
          {busy ? "Saving…" : "Save handle"}
        </button>
      </div>
    </form>
  );
}
