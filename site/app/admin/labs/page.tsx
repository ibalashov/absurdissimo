"use client";

// Association-quality lab (VocabCards #426): configure a batch, run it,
// compare results. One page holds the three panes — batch setup, the open
// run's results, and the run history — so a finished run is one click away
// from tweaking the setup and running again. The selected pair is page-level
// state because both the setup and the history filter use it; it persists in
// localStorage the same way the starter-pack manager's pair does.

import { useCallback, useEffect, useState } from "react";
import { fetchPairsLive, type PairSummary } from "@/lib/api";
import BatchSetup from "./BatchSetup";
import RunHistory from "./RunHistory";
import RunView from "./RunView";

const PAIR_KEY = "admin.labsPair";

export default function LabsPage() {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [pair, setPairState] = useState("");
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  // Bumped when a new run starts so the history list refetches.
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchPairsLive().then((ps) => {
      if (cancelled) return;
      setPairs(ps);
      if (ps.length === 0) return;
      // Prefer the saved pair when it's still a live pair; otherwise the
      // first in the list. localStorage is client-only, so this can't run in
      // render (SSR mismatch).
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

  const setPair = useCallback((next: string) => {
    setPairState(next);
    try {
      localStorage.setItem(PAIR_KEY, next);
    } catch {
      // Private-mode / storage-disabled: keep the in-memory value.
    }
  }, []);

  return (
    <>
      <h1>Association quality</h1>
      <p className="admin-intro">
        Run one word list through several generation configs side by side,
        compare the cards, and pick winners. Text only — no images are
        generated here.
      </p>
      <BatchSetup
        pairs={pairs}
        pair={pair}
        setPair={setPair}
        onRunStarted={(runId) => {
          setActiveRunId(runId);
          setHistoryVersion((v) => v + 1);
        }}
      />
      {activeRunId !== null && (
        // Keyed so reopening a different run resets the poll and pick state.
        <RunView key={activeRunId} runId={activeRunId} />
      )}
      <RunHistory
        pair={pair}
        version={historyVersion}
        activeRunId={activeRunId}
        onOpen={setActiveRunId}
      />
    </>
  );
}
