"use client";

// Shared state for the starter-pack manager (VocabCards #366), split across
// sub-pages (current pack / browse & select / generate). This provider lives
// in the section layout, so the App Router keeps it mounted while you move
// between the sub-pages: the selected pair and the loaded pack survive
// navigation and are the single source of truth. Membership marks in the
// browse/generate panes derive from `pack`, and every mutation resyncs it from
// the server. Access is enforced server-side; the /admin layout gate only
// hides the shell.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { fetchPairsLive, type PairSummary } from "@/lib/api";
import {
  addToStarterPack,
  fetchStarterPack,
  isAdminStatus,
  removeFromStarterPack,
  reorderStarterPack,
  type AdminCard,
} from "@/lib/admin";
import StarterPackChrome from "./StarterPackChrome";

// Advisory pack size (the app's starter deck aims for 12) — never enforced,
// and now adjustable in the toolbar. This is the default for a fresh browser;
// the chosen value persists in localStorage (admin-only, client-side).
export const DEFAULT_PACK_TARGET = 12;
const PACK_TARGET_KEY = "admin.starterPackTarget";
// The chosen pair persists too, so it survives a reload or a deep-link into a
// sub-page. Across sub-page navigation the provider stays mounted and state
// already survives; this covers the fresh-load case (otherwise the pair snaps
// back to the first in the list).
const PAIR_KEY = "admin.starterPackPair";
export const IMAGE_POLL_MS = 3000;

function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PACK_TARGET;
  return Math.max(1, Math.min(99, Math.floor(n)));
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export interface StarterPackValue {
  pairs: PairSummary[] | null;
  pair: string;
  setPair: (pair: string) => void;
  packTarget: number;
  setPackTarget: (target: number) => void;
  selected: PairSummary | null;
  pack: AdminCard[] | null;
  packIds: Set<number> | null;
  packError: string | null;
  packNotice: string | null;
  packBusy: boolean;
  refreshPack: () => Promise<void>;
  addCard: (associationId: number) => Promise<boolean>;
  reorderPack: (fromIndex: number, toIndex: number) => Promise<void>;
  remove: (associationId: number) => Promise<void>;
}

const StarterPackCtx = createContext<StarterPackValue | null>(null);

export function useStarterPack(): StarterPackValue {
  const ctx = useContext(StarterPackCtx);
  if (!ctx) {
    throw new Error("useStarterPack must be used within StarterPackProvider");
  }
  return ctx;
}

export function StarterPackProvider({ children }: { children: ReactNode }) {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [pair, setPairState] = useState("");
  const [packTarget, setPackTargetState] = useState(DEFAULT_PACK_TARGET);
  const [pack, setPack] = useState<AdminCard[] | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  // setPair persists so the chosen pair survives reloads and deep-links, the
  // same way packTarget does.
  const setPair = useCallback((next: string) => {
    setPairState(next);
    try {
      localStorage.setItem(PAIR_KEY, next);
    } catch {
      // Private-mode / storage-disabled: keep the in-memory value.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPairsLive().then((ps) => {
      if (cancelled) return;
      setPairs(ps);
      if (ps.length === 0) return;
      // Prefer the saved pair when it's still a live pair; otherwise the first
      // in the list. localStorage is client-only, so this can't run in render.
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(PAIR_KEY);
      } catch {
        saved = null;
      }
      const initial =
        saved && ps.some((p) => p.pair === saved) ? saved : ps[0].pair;
      setPairState((cur) => cur || initial);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the saved target after mount (localStorage is client-only, so this
  // can't run during render without an SSR mismatch).
  useEffect(() => {
    const raw = localStorage.getItem(PACK_TARGET_KEY);
    if (raw !== null) setPackTargetState(clampTarget(Number(raw)));
  }, []);

  const setPackTarget = useCallback((target: number) => {
    const clamped = clampTarget(target);
    setPackTargetState(clamped);
    try {
      localStorage.setItem(PACK_TARGET_KEY, String(clamped));
    } catch {
      // Private-mode / storage-disabled: keep the in-memory value.
    }
  }, []);

  const refreshPack = useCallback(async () => {
    if (!pair) return;
    try {
      const data = await fetchStarterPack(pair);
      setPack(
        [...data.cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      );
      setPackError(null);
    } catch (err) {
      setPackError(errorMessage(err));
    }
  }, [pair]);

  useEffect(() => {
    setPack(null);
    setPackError(null);
    setPackNotice(null);
    void refreshPack();
  }, [refreshPack]);

  // Shared by the browse and generate panes. 409 (already a member) counts as
  // success — the pack resync below marks the tile either way.
  const addCard = useCallback(
    async (associationId: number): Promise<boolean> => {
      try {
        await addToStarterPack(pair, associationId);
      } catch (err) {
        if (!isAdminStatus(err, 409)) {
          setPackNotice(errorMessage(err));
          void refreshPack();
          return false;
        }
      }
      setPackNotice(null);
      await refreshPack();
      return true;
    },
    [pair, refreshPack],
  );

  // Drag-and-drop reorder: pull the card out of `fromIndex` and drop it at
  // `toIndex`. Optimistic — the PUT carries the full membership in the new
  // order, so the server just rewrites positions.
  const reorderPack = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!pack) return;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= pack.length ||
        toIndex < 0 ||
        toIndex >= pack.length
      ) {
        return;
      }
      const next = [...pack];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setPack(next); // optimistic; the PUT carries the full new order
      setPackBusy(true);
      try {
        await reorderStarterPack(
          pair,
          next.map((c) => c.association_id),
        );
        setPackNotice(null);
      } catch (err) {
        // 409 = the membership changed under us (stale view): reload and say so.
        setPackNotice(
          isAdminStatus(err, 409)
            ? "The pack changed elsewhere — reloaded the current version."
            : errorMessage(err),
        );
        await refreshPack();
      } finally {
        setPackBusy(false);
      }
    },
    [pack, pair, refreshPack],
  );

  const remove = useCallback(
    async (associationId: number) => {
      setPackBusy(true);
      try {
        await removeFromStarterPack(pair, associationId);
        setPackNotice(null);
      } catch (err) {
        // 404 = already gone; the resync below settles it either way.
        if (!isAdminStatus(err, 404)) setPackNotice(errorMessage(err));
      } finally {
        await refreshPack();
        setPackBusy(false);
      }
    },
    [pair, refreshPack],
  );

  const selected = pairs?.find((p) => p.pair === pair) ?? null;
  const packIds = pack ? new Set(pack.map((c) => c.association_id)) : null;

  const value: StarterPackValue = {
    pairs,
    pair,
    setPair,
    packTarget,
    setPackTarget,
    selected,
    pack,
    packIds,
    packError,
    packNotice,
    packBusy,
    refreshPack,
    addCard,
    reorderPack,
    remove,
  };

  return (
    <StarterPackCtx.Provider value={value}>
      <StarterPackChrome>{children}</StarterPackChrome>
    </StarterPackCtx.Provider>
  );
}
