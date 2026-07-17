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

// PostHog deep links for a card (VocabCards #476). The events explorer reads a
// serialized EventsQuery from the URL hash. Instance and project are hardcoded:
// the admin is the site's only PostHog-aware surface, and it always points at
// the one production project.
const POSTHOG_PROJECT_URL = "https://eu.posthog.com/project/210619";

function exploreUrl(source: Record<string, unknown>): string {
  const query = {
    kind: "DataTableNode",
    full: true,
    source: {
      kind: "EventsQuery",
      select: ["*", "event", "person", "timestamp"],
      orderBy: ["timestamp DESC"],
      after: "all",
      ...source,
    },
  };
  return `${POSTHOG_PROJECT_URL}/activity/explore#q=${encodeURIComponent(JSON.stringify(query))}`;
}

// Every product event carrying this card's word + pair properties
// (card_fetched, card_rated, association_regenerated, admin_card_*,
// card_load_failed, regenerate_failed, …). Cached serves log the display word
// while fresh generations log the canonical one, so match either.
export function posthogCardEventsUrl(
  words: string[],
  sourceLanguage: string,
  targetLanguage: string,
): string {
  return exploreUrl({
    properties: [
      { type: "event", key: "word", operator: "exact", value: [...new Set(words)] },
      { type: "event", key: "source_language", operator: "exact", value: [sourceLanguage] },
      { type: "event", key: "target_language", operator: "exact", value: [targetLanguage] },
    ],
  });
}

// $ai_generation traces can't be filtered to a card directly: PostHog strips
// $ai_input from the stored event and the per-request $ai_trace_id is never
// persisted in the association store. Bracketing the card's creation instead —
// at current generation volume a ±10 min window singles out this card's text
// and image traces.
export function posthogLlmTracesUrl(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  const minutes = 10 * 60 * 1000;
  return exploreUrl({
    event: "$ai_generation",
    orderBy: ["timestamp ASC"],
    after: new Date(created - minutes).toISOString(),
    before: new Date(created + minutes).toISOString(),
  });
}
