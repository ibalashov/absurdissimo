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

// The card's identity properties, stamped by both the server and the app
// since VocabCards#480/#481: card_id (the associations row id) pins one exact
// card; card_stack ("{source}-{target}:{word}", full language names) groups
// every variant of one (pair, word).
export function cardStackKey(
  sourceLanguage: string,
  targetLanguage: string,
  word: string,
): string {
  return `${sourceLanguage}-${targetLanguage}:${word.toLowerCase()}`;
}

// Every event of this exact card: card_fetched, card_rated,
// association_regenerated, admin_card_*, favorite_toggled, card_shared, ….
// Events captured before the card_id stamp existed won't match.
export function posthogCardEventsUrl(cardId: number): string {
  return exploreUrl({
    properties: [
      { type: "event", key: "card_id", operator: "exact", value: [String(cardId)] },
    ],
  });
}

// Every event across the word's whole stack of variants, including
// pre-card events (word_selected, card_load_failed) that carry only the
// stack key.
export function posthogStackEventsUrl(stack: string): string {
  return exploreUrl({
    properties: [
      { type: "event", key: "card_stack", operator: "exact", value: [stack] },
    ],
  });
}

// The card's $ai_generation traces. Exact when the server persisted the
// generating/rendering requests' trace ids (VocabCards#480); for rows from
// before that, fall back to a ±10 min bracket around creation — PostHog
// strips $ai_input from stored events, so time is the only join for legacy
// rows.
export function posthogLlmTracesUrl(
  traceIds: (string | null | undefined)[],
  createdAt: string,
): string {
  const ids = [...new Set(traceIds.filter((t): t is string => Boolean(t)))];
  if (ids.length > 0) {
    return exploreUrl({
      event: "$ai_generation",
      orderBy: ["timestamp ASC"],
      properties: [
        { type: "event", key: "$ai_trace_id", operator: "exact", value: ids },
      ],
    });
  }
  const created = new Date(createdAt).getTime();
  const minutes = 10 * 60 * 1000;
  return exploreUrl({
    event: "$ai_generation",
    orderBy: ["timestamp ASC"],
    after: new Date(created - minutes).toISOString(),
    before: new Date(created + minutes).toISOString(),
  });
}
