import Link from "next/link";
import { ADMIN_SECTIONS } from "./sections";

// Admin landing page: one card per registered section. Access control and
// noindex live in the layout gate (layout.tsx).

export default function AdminHome() {
  return (
    <>
      <h1>Admin</h1>
      <p className="admin-intro">
        Internal tools for running Absurdissimo. This area is visible only to
        allowlisted accounts.
      </p>
      <div className="admin-section-grid">
        {ADMIN_SECTIONS.map((s) => (
          <Link key={s.href} className="admin-section-card" href={s.href}>
            <h2>{s.title}</h2>
            <p>{s.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
