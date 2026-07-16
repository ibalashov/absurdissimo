// Small helpers shared by the association-quality lab components
// (VocabCards #426). Pure functions only — no fetching, no React.

// The server's five absurdity levels, in ramp order. "wild" is the default
// both here and in the batch endpoint.
export const ABSURDITIES = [
  "sensible",
  "quirky",
  "wild",
  "bizarre",
  "unhinged",
] as const;
export const DEFAULT_ABSURDITY = "wild";

// Fallback only while prompts load (and for null stored refs); live ref is from
// GET /admin/labs/prompts.
export const PROD_PROMPT_REF = "prod:v4";

export function isProdPromptRef(ref: string): boolean {
  return ref.startsWith("prod:");
}

// Display label for a prompt ref: the template's name when the prompts list
// resolves "lab:<id>", otherwise the raw ref (prod refs have no nicer name).
export function promptLabel(
  ref: string,
  prompts: { id: number; name: string }[] | null | undefined,
): string {
  if (ref.startsWith("lab:")) {
    const id = Number(ref.slice(4));
    const hit = (prompts ?? []).find((p) => p.id === id);
    if (hit) return hit.name;
  }
  return ref;
}

// Composite lookup key for a run entry: runs may repeat a config key with
// different prompts (#427), so generations match on (config_key, prompt_ref).
export function entryKey(
  configKey: string,
  promptRef: string | null | undefined,
): string {
  return `${configKey}\u0000${promptRef ?? PROD_PROMPT_REF}`;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

// Money spans four orders of magnitude here (per-card unit prices are
// fractions of a cent; run totals are dollars) — show four decimals below
// ten cents so cheap configs don't all collapse to $0.00.
export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("en-US")} ms`;
}

// judge_scores arrives as a parsed object (VocabCards#425 serves it that
// way), but parse a JSON string too, defensively — return null for anything
// unusable. Values mix numeric dimension scores with a justification string.
export function judgeScores(
  raw: Record<string, number | string> | string | null | undefined,
): Record<string, number | string> | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number | string>;
    }
    return null;
  } catch {
    return null;
  }
}

// Textarea → word list: one word per line, trimmed, blanks dropped,
// case-insensitively deduped keeping first spelling and order.
export function parseWordList(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const word = line.trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

// Append suggested/sampled words to the textarea contents, deduped against
// what's already there (manual entry keeps priority and order).
export function mergeWordList(text: string, added: string[]): string {
  return parseWordList(`${text}\n${added.join("\n")}`).join("\n");
}
