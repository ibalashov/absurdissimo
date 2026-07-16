"use client";

// Shared state for the Cards section (VocabCards #458): the server-side
// filter set, the pair list for the picker, and dropdown options harvested
// from the stats endpoint (distinct models / prompt versions actually in the
// corpus). Lives in the section layout so filters survive switching between
// the table / gallery / by-word / stats tabs.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchPairsLive, type PairSummary } from "@/lib/api";
import { fetchCardStats, type InventoryFilters } from "@/lib/admin";

// UI filter state: all strings so inputs bind directly; "" means unset.
export interface CardsFilterState {
  pair: string;
  q: string;
  word: string;
  model: string;
  promptVersion: string;
  provider: string;
  audience: string;
  absurdity: string;
  status: string;
  errorsOnly: boolean;
  createdAfter: string; // yyyy-mm-dd from <input type="date">
  createdBefore: string;
}

export const EMPTY_FILTERS: CardsFilterState = {
  pair: "",
  q: "",
  word: "",
  model: "",
  promptVersion: "",
  provider: "",
  audience: "",
  absurdity: "",
  status: "",
  errorsOnly: false,
  createdAfter: "",
  createdBefore: "",
};

// The API-facing shape. Date bounds widen to full-day UTC stamps so a
// same-day range means "that whole day" (the server compares ISO strings).
export function toApiFilters(f: CardsFilterState): InventoryFilters {
  return {
    pair: f.pair || undefined,
    q: f.q.trim() || undefined,
    word: f.word || undefined,
    model: f.model || undefined,
    prompt_version: f.promptVersion || undefined,
    provider: f.provider || undefined,
    audience: f.audience || undefined,
    absurdity: f.absurdity || undefined,
    status: (f.status as InventoryFilters["status"]) || undefined,
    errors_only: f.errorsOnly || undefined,
    created_after: f.createdAfter
      ? `${f.createdAfter}T00:00:00+00:00`
      : undefined,
    created_before: f.createdBefore
      ? `${f.createdBefore}T23:59:59+00:00`
      : undefined,
  };
}

interface CardsContextValue {
  pairs: PairSummary[] | null;
  filters: CardsFilterState;
  setFilters: (patch: Partial<CardsFilterState>) => void;
  clearFilters: () => void;
  apiFilters: InventoryFilters;
  // Serialized filters — stable dependency key for data-fetching effects.
  filtersKey: string;
  modelOptions: string[];
  promptVersionOptions: string[];
}

const CardsContext = createContext<CardsContextValue | null>(null);

export function useCards(): CardsContextValue {
  const ctx = useContext(CardsContext);
  if (!ctx) throw new Error("useCards must be used within CardsProvider");
  return ctx;
}

export function CardsProvider({ children }: { children: ReactNode }) {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [filters, setFiltersState] = useState<CardsFilterState>(EMPTY_FILTERS);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [promptVersionOptions, setPromptVersionOptions] = useState<string[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchPairsLive().then(
      (ps) => {
        if (!cancelled) setPairs(ps);
      },
      () => {
        if (!cancelled) setPairs([]);
      },
    );
    // Dropdown options = the distinct values actually present in the corpus,
    // via the unfiltered stats rollups (biggest group first). Best-effort:
    // a failure just leaves the dropdowns with only "any".
    void fetchCardStats({}, "model").then(
      (stats) => {
        if (cancelled) return;
        setModelOptions(stats.rows.map((r) => r.grp).filter((g): g is string => !!g));
      },
      () => {},
    );
    void fetchCardStats({}, "prompt_version").then(
      (stats) => {
        if (cancelled) return;
        setPromptVersionOptions(
          stats.rows.map((r) => r.grp).filter((g): g is string => !!g),
        );
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setFilters = useCallback((patch: Partial<CardsFilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearFilters = useCallback(() => setFiltersState(EMPTY_FILTERS), []);

  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const filtersKey = useMemo(() => JSON.stringify(apiFilters), [apiFilters]);

  const value = useMemo(
    () => ({
      pairs,
      filters,
      setFilters,
      clearFilters,
      apiFilters,
      filtersKey,
      modelOptions,
      promptVersionOptions,
    }),
    [
      pairs,
      filters,
      setFilters,
      clearFilters,
      apiFilters,
      filtersKey,
      modelOptions,
      promptVersionOptions,
    ],
  );

  return <CardsContext.Provider value={value}>{children}</CardsContext.Provider>;
}
