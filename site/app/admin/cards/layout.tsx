import type { Metadata } from "next";
// Reuses the shared admin control styles (.admin-pane, .admin-btn,
// .admin-input, .admin-pager, .pack-tabs) built with the starter-pack manager,
// and the labs table styles (.lab-table, .lab-sort-btn, .lab-status) for the
// data grids; cards.css adds only cards-specific classes on top.
import "../starter-packs/starter-packs.css";
import "../labs/labs.css";
import "./cards.css";
import { CardsProvider } from "./CardsContext";
import CardsChrome from "./CardsChrome";

export const metadata: Metadata = {
  title: "Cards — Admin — Absurdissimo",
};

// The Cards inventory (VocabCards #457/#458): one place to inspect every
// generated card variant — table, gallery, by-word, and stats views over the
// same server-side filter set. Access control and noindex live in the /admin
// layout gate (../layout.tsx).

export default function CardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CardsProvider>
      {/* Marker for the .admin-shell:has(.cards-full-bleed) full-width rule
          (cards.css): the inventory is a wide data table, so Cards pages get
          the whole viewport while other admin sections keep their cap. */}
      <div className="cards-full-bleed">
        <CardsChrome>{children}</CardsChrome>
      </div>
    </CardsProvider>
  );
}
