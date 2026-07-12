import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Starter packs — Admin — Absurdissimo",
};

// Placeholder: the real starter pack manager is VocabCards #366 (pair
// switcher, current-pack ordering, corpus browse/select, generate).

export default function StarterPacksPage() {
  return (
    <>
      <h1>Starter packs</h1>
      <p className="admin-intro">
        The starter pack manager lands here (VocabCards #366): pick, order, and
        generate the cards each pair ships with.
      </p>
    </>
  );
}
