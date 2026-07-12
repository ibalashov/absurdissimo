"use client";

// Shared chrome for the starter-pack sub-pages: the section heading, the pair
// switcher + pack-size badge, transient action notices, and the sub-nav that
// links between the three sub-pages. Rendered once by the provider so it stays
// put as you move between sub-pages; only the {children} slot below swaps.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { languageFlag, languageName } from "@/lib/api";
import { useStarterPack } from "./StarterPackContext";

const SUB_PAGES = [
  { href: "/admin/starter-packs", label: "Current pack" },
  { href: "/admin/starter-packs/browse", label: "Browse & select" },
  { href: "/admin/starter-packs/generate", label: "Generate" },
];

export default function StarterPackChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { pairs, pair, setPair, packTarget, setPackTarget, pack, packNotice } =
    useStarterPack();

  return (
    <>
      <h1>Starter packs</h1>
      <p className="admin-intro">
        Pick, order, and generate the cards each pair ships with. Aim for
        about {packTarget} cards — the target is advisory, not enforced.
      </p>

      <div className="pack-toolbar">
        <label className="pack-toolbar-label" htmlFor="pair-select">
          Pair
        </label>
        <select
          id="pair-select"
          className="admin-input"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          disabled={!pairs || pairs.length === 0}
        >
          {(pairs ?? []).map((p) => (
            <option key={p.pair} value={p.pair}>
              {languageFlag(p.source_language) ?? ""}{" "}
              {languageName(p.source_language)} →{" "}
              {languageFlag(p.target_language) ?? ""}{" "}
              {languageName(p.target_language)}
            </option>
          ))}
        </select>
        <label className="pack-toolbar-label" htmlFor="target-input">
          Target
        </label>
        <input
          id="target-input"
          className="admin-input pack-target-input"
          type="number"
          min={1}
          max={99}
          value={packTarget}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) setPackTarget(n);
          }}
          aria-label="Target number of cards per pack"
        />
        {pack && (
          <span
            className={`pack-badge${pack.length >= packTarget ? " full" : ""}`}
          >
            {pack.length} / {packTarget} target
          </span>
        )}
      </div>
      {pairs && pairs.length === 0 && (
        <p className="admin-error">
          Could not load the pair list — is the server reachable?
        </p>
      )}

      <nav className="pack-tabs" aria-label="Starter pack sections">
        {SUB_PAGES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`pack-tab${pathname === s.href ? " active" : ""}`}
            aria-current={pathname === s.href ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {packNotice && <p className="admin-notice">{packNotice}</p>}

      {children}
    </>
  );
}
