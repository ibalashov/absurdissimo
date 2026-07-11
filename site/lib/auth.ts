// Client-side community auth (VocabCards #307; server counterpart #306).
// Google only *proves* identity: the site obtains a Google id_token via GIS
// (see components/CommunityAuth.tsx), exchanges it once at POST /auth/google —
// together with the anonymous device id, so the visitor's pre-sign-in actor
// merges into the account — and from then on sends the server's own opaque
// bearer token on entry/comment writes. The token lives in localStorage and
// travels as an Authorization header: explicitly NO cookies and NO middleware
// involvement (Set-Cookie in middleware on GET paths is a known prod-only
// prefetch trap in this site — see middleware.ts).
//
// Everything here is client-only (localStorage); no function below may run
// during SSR except the snapshot getters wired for useSyncExternalStore.

import { API_BASE } from "./api";

const DEVICE_ID_KEY = "vc_device_id";

// Stable per-browser anonymous id, created lazily on first write/interaction.
// Client-only (localStorage); callers must not invoke this during SSR.
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const TOKEN_KEY = "vc_auth_token";
const HANDLE_KEY = "vc_auth_handle";
const NEEDS_HANDLE_KEY = "vc_auth_needs_handle";

export interface AuthState {
  token: string | null;
  // Display handle as of sign-in (the anon placeholder until the user picks
  // one). Shown as "posting as …"; the server is the source of truth.
  handle: string | null;
  // True until the user picks a handle or skips the prompt; a fresh sign-in
  // re-reads it from the server, so a skipped prompt comes back later.
  needsHandle: boolean;
}

const SIGNED_OUT: AuthState = { token: null, handle: null, needsHandle: false };

// Snapshot cache + subscribers for useSyncExternalStore (components/
// CommunityAuth.tsx wraps this in a useAuth() hook). The cache keeps the
// snapshot referentially stable between changes, as the hook requires.
let cached: AuthState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  cached = null;
  for (const listener of listeners) listener();
}

export function getAuthState(): AuthState {
  if (cached === null) {
    const token = localStorage.getItem(TOKEN_KEY);
    cached = token
      ? {
          token,
          handle: localStorage.getItem(HANDLE_KEY),
          needsHandle: localStorage.getItem(NEEDS_HANDLE_KEY) === "1",
        }
      : SIGNED_OUT;
  }
  return cached;
}

// SSR renders signed-out; the client store takes over after hydration.
export function getServerAuthState(): AuthState {
  return SIGNED_OUT;
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Bearer token for community writes, or null when signed out.
export function getToken(): string | null {
  return typeof window === "undefined" ? null : getAuthState().token;
}

// Drop the stored token and return the UI to signed-out. Called on any 401
// from a bearer-authenticated call, so an expired/revoked token re-prompts
// for sign-in instead of dead-ending in an error state.
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(HANDLE_KEY);
  localStorage.removeItem(NEEDS_HANDLE_KEY);
  notify();
}

interface SignInResponse {
  token: string;
  handle: string;
  needs_handle: boolean;
}

// One-time exchange: Google id_token (+ device id, for the actor merge) →
// server-issued opaque bearer token. Throws with the server's message on
// failure (401 invalid token, 503 sign-in not configured).
export async function signInWithGoogle(idToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: {
      "X-Device-Id": getDeviceId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail;
    throw new Error(
      typeof detail === "string" ? detail : `Sign-in failed (${res.status})`,
    );
  }
  const data = (await res.json()) as SignInResponse;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(HANDLE_KEY, data.handle);
  localStorage.setItem(NEEDS_HANDLE_KEY, data.needs_handle ? "1" : "0");
  notify();
}

// One-shot display-handle choice at first sign-in. Throws with the server's
// message on rejection (400 malformed/profane, 409 taken) so the prompt can
// surface it inline and let the user retry.
export async function chooseHandle(handle: string): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`${API_BASE}/auth/handle`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ handle }),
  });
  if (res.status === 401) {
    clearAuth();
    throw new Error("Your session expired — please sign in again.");
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail;
    if (res.status === 409 && detail === "Handle is already set") {
      // Chosen from another tab/device meanwhile; nothing left to do here.
      localStorage.setItem(NEEDS_HANDLE_KEY, "0");
      notify();
      return;
    }
    throw new Error(
      typeof detail === "string" ? detail : `Could not set handle (${res.status})`,
    );
  }
  localStorage.setItem(HANDLE_KEY, handle);
  localStorage.setItem(NEEDS_HANDLE_KEY, "0");
  notify();
}

// The handle prompt is skippable — contributions then carry the anon
// placeholder handle. Persist the skip so the prompt doesn't nag on every
// page view; the next fresh sign-in re-offers it (needs_handle comes back
// true from the server until a handle is actually chosen).
export function skipHandlePrompt(): void {
  localStorage.setItem(NEEDS_HANDLE_KEY, "0");
  notify();
}
