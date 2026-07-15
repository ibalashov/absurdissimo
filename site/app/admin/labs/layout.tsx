import type { Metadata } from "next";
// The shared admin control styles (.admin-pane, .admin-btn, .admin-input,
// .admin-error/.admin-notice, .pack-toolbar, .batch-scene, .admin-pager) were
// built with the starter-pack manager (#366) and live in its stylesheet; the
// lab reuses them rather than forking a copy. labs.css adds only lab-specific
// classes on top.
import "../starter-packs/starter-packs.css";
import "./labs.css";

export const metadata: Metadata = {
  title: "Association quality — Admin — Absurdissimo",
};

// Association-quality lab (VocabCards #426, part of the labs epic #423):
// batch-generate one word list across several model configs and compare the
// results side by side. Access control and noindex live in the /admin layout
// gate (../layout.tsx).

export default function LabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
