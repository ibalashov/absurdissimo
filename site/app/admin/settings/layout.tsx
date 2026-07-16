import type { Metadata } from "next";
// Reuses the shared admin control styles (.admin-pane, .admin-btn, .admin-input,
// .admin-error/.admin-notice, .admin-pane-hint) built with the starter-pack
// manager; settings.css adds only the field-row layout on top.
import "../starter-packs/starter-packs.css";
import "./settings.css";

export const metadata: Metadata = {
  title: "Runtime settings — Admin — Absurdissimo",
};

// Runtime settings (VocabCards #433/#434): change the live generation model,
// system prompt, prompt version, and default absurdity without a redeploy.
// Access control and noindex live in the /admin layout gate (../layout.tsx).

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
