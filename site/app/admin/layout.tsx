import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/chrome";
import { API_BASE } from "@/lib/api";
import { ADMIN_TOKEN_COOKIE } from "@/lib/auth";
import { ADMIN_SECTIONS } from "./sections";
import "../cards.css";
import "./admin.css";

// The admin area (VocabCards #363). The gate is THIS server layout and nothing
// else: it reads the /admin-scoped session cookie (mirrored client-side by
// lib/auth.ts — never by middleware, see the prefetch-trap history in
// middleware.ts) and asks the server's GET /admin/me whether the session's
// account is on the admin allowlist. Anything but a 200 — signed out, not
// allowlisted, server unreachable — renders the site's 404, so the route
// never advertises itself. Every page below inherits the gate and the
// noindex.

export const metadata: Metadata = {
  title: "Admin — Absurdissimo",
  robots: { index: false, follow: false },
};

async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value;
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false; // fail closed
  }
}

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAdmin())) notFound();
  return (
    <>
      <SiteNav />
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-title">Admin</div>
          <nav className="admin-sidebar-nav">
            <Link href="/admin">Overview</Link>
            {ADMIN_SECTIONS.map((s) => (
              <Link key={s.href} href={s.href}>
                {s.title}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="admin-main">{children}</main>
      </div>
    </>
  );
}
