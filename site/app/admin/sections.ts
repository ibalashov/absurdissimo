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
    title: "Starter packs",
    href: "/admin/starter-packs",
    description:
      "Curate each pair's starter pack: select, order, and generate cards.",
  },
];
