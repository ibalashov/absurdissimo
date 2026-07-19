"use client";

// Association-quality lab (VocabCards #426): configure a batch, run it,
// compare results. One page holds the panes — batch setup, prompt templates,
// the open run's results, and the run history — so a finished run is one
// click away from tweaking the setup and running again. The selected pair is
// page-level state because both the setup and the history filter use it; it
// persists in localStorage the same way the starter-pack manager's pair does.
// Prompt templates (VocabCards #427) are page-level too: the pane lists and
// creates them, BatchSetup's per-config selectors offer them, and RunView
// resolves "lab:<id>" refs to their names.

import { useCallback, useEffect, useState } from "react";
import { type PairSummary } from "@/lib/api";
import {
  fetchAdminPairs,
  fetchLabPrompts,
  type LabPrompt,
  type LabPromptsResponse,
} from "@/lib/admin";
import BatchSetup from "./BatchSetup";
import PromptsPane from "./PromptsPane";
import RunHistory from "./RunHistory";
import RunView from "./RunView";
import { errorMessage, PROD_PROMPT_REF } from "./util";

const PAIR_KEY = "admin.labsPair";

export default function LabsPage() {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [pairsError, setPairsError] = useState<string | null>(null);
  const [pair, setPairState] = useState("");
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  // Bumped when a new run starts so the history list refetches.
  const [historyVersion, setHistoryVersion] = useState(0);
  const [promptData, setPromptData] = useState<LabPromptsResponse | null>(
    null,
  );
  const [promptsError, setPromptsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLabPrompts().then(
      (fresh) => {
        if (!cancelled) setPromptData(fresh);
      },
      (err: unknown) => {
        if (!cancelled) setPromptsError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Newest first, matching the server's ordering.
  const onPromptCreated = useCallback((prompt: LabPrompt) => {
    setPromptData((cur) =>
      cur ? { ...cur, prompts: [prompt, ...cur.prompts] } : cur,
    );
  }, []);

  // /admin/pairs, not /public/pairs (VocabCards #540): the public list only
  // carries pairs with active cards, so the picker went empty — looking like
  // an outage — on an empty corpus.
  useEffect(() => {
    let cancelled = false;
    fetchAdminPairs().then(
      (ps) => {
        if (cancelled) return;
        setPairs(ps);
        setPairsError(null);
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
      },
      (err: unknown) => {
        if (!cancelled) setPairsError(errorMessage(err));
      },
    );
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
        pairsError={pairsError}
        pair={pair}
        setPair={setPair}
        prompts={promptData?.prompts ?? null}
        prodRef={promptData?.prod.ref ?? PROD_PROMPT_REF}
        onRunStarted={(runId) => {
          setActiveRunId(runId);
          setHistoryVersion((v) => v + 1);
        }}
      />
      <PromptsPane
        prompts={promptData?.prompts ?? null}
        prod={promptData?.prod ?? null}
        loadError={promptsError}
        onCreated={onPromptCreated}
      />
      {activeRunId !== null && (
        // Keyed so reopening a different run resets the poll and pick state.
        <RunView
          key={activeRunId}
          runId={activeRunId}
          prompts={promptData?.prompts ?? null}
        />
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
