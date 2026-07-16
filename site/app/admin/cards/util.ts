// Pure helpers for the admin Cards section (VocabCards #458). Money/latency
// formatting is shared with the labs (same telemetry numbers) — see the
// re-exports; only cards-specific helpers live here.

export { errorMessage, fmtMs, fmtUsd, ABSURDITIES } from "../labs/util";

// Exact relative age for the live-ticking "Age" column: seconds-precision up
// to an hour ("45m 15s ago"), minute-precision up to a day, then days+hours.
// Client-tick only (rows render after a client fetch), so no hydration risk.
export function agoExact(isoDate: string, now: number): string {
  let seconds = Math.max(
    0,
    Math.floor((now - new Date(isoDate).getTime()) / 1000),
  );
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  const parts = days
    ? [`${days}d`, `${hours}h`]
    : hours
      ? [`${hours}h`, `${minutes}m`, `${seconds}s`]
      : minutes
        ? [`${minutes}m`, `${seconds}s`]
        : [`${seconds}s`];
  return `${parts.join(" ")} ago`;
}

// Provider for display: the stamped value when the row has one (#457), else
// derived from the model name (legacy rows predate the provider column).
// `derived` lets the UI render the guess muted.
export function providerOf(row: {
  provider: string | null;
  model: string | null;
}): { name: string; derived: boolean } | null {
  if (row.provider) return { name: row.provider, derived: false };
  if (row.model?.startsWith("gemini")) return { name: "gemini", derived: true };
  if (row.model?.startsWith("gpt")) return { name: "openai", derived: true };
  return null;
}

// Pair slug ("it-en") from the API's full language names — the reverse of the
// server's slug parsing, needed to link rows out to /c/{pair}/{word} and to
// call hideAdminCard (which revalidates the pair's decks).
const LANGUAGE_SLUGS: Record<string, string> = {
  english: "en",
  russian: "ru",
  italian: "it",
  german: "de",
  french: "fr",
  spanish: "es",
  hebrew: "he",
};

export function pairSlug(sourceLanguage: string, targetLanguage: string): string {
  const src = LANGUAGE_SLUGS[sourceLanguage] ?? sourceLanguage;
  const tgt = LANGUAGE_SLUGS[targetLanguage] ?? targetLanguage;
  return `${src}-${tgt}`;
}
