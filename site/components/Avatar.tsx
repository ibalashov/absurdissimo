// Community avatar (VocabCards #330/#331): the account's emoji on a colored
// disc. The emoji comes from the server (curated set, random default); the
// disc color is derived client-side, deterministically from the stable
// account id, so the same account renders the same disc everywhere without
// the server storing a color. Purely presentational — usable from server and
// client components alike.

// Small palette of muted tones that sit well on the dark theme (and under a
// full-color emoji). Order matters: it is part of the id → color mapping.
const DISC_COLORS = [
  "#4a5568", // slate
  "#3e5f5a", // teal
  "#5b4a6f", // violet
  "#6b5138", // ochre
  "#54613f", // moss
  "#6b4351", // plum
];

export function discColor(accountId: number): string {
  return DISC_COLORS[Math.abs(accountId) % DISC_COLORS.length];
}

// `emoji` is optional on purpose: until server #330 is deployed the payloads
// carry no avatar field, and the component degrades to a plain colored disc
// instead of crashing or collapsing the layout. Always decorative (the handle
// text next to it carries the meaning), hence aria-hidden.
export default function Avatar({
  emoji,
  accountId,
  size,
}: {
  emoji?: string | null;
  accountId: number;
  size: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: discColor(accountId) }}
      aria-hidden="true"
    >
      {emoji ?? ""}
    </span>
  );
}
