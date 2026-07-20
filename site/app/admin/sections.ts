// Registry driving the admin shell (VocabCards #363): the sidebar nav and the
// landing page both render from this list, so a future section (corpus
// browser, quality-lab views, retire tooling) is one entry here plus its page
// under app/admin/ — no layout work.

export interface AdminSection {
  title: string;
  href: string;
  description: string;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    title: "Cards",
    href: "/admin/cards",
    description:
      "Inspect every generated card: table, gallery, by-word, and stats views.",
  },
  {
    title: "Starter packs",
    href: "/admin/starter-packs",
    description:
      "Curate each pair's starter pack: select, order, and generate cards.",
  },
  {
    title: "Association quality",
    href: "/admin/labs",
    description:
      "Run generation batches and compare association quality across models.",
  },
  {
    title: "Accent lab",
    href: "/admin/labs/accent",
    description:
      "Compare US-only and dual-accent IPA prompts on English source words.",
  },
  {
    title: "Runtime settings",
    href: "/admin/settings",
    description:
      "Change the live generation model, prompt, prompt version, and default absurdity.",
  },
  {
    title: "Word info",
    href: "/admin/word-info",
    description:
      "Review per-pair seed status and browse seeded or live word info rows.",
  },
];
