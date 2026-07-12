import { redirect } from "next/navigation";
import { ADMIN_SECTIONS } from "./sections";

// Entering /admin lands straight on the first section (starter packs) rather
// than a separate overview — there's a single section today, so the overview
// was just an extra click. Registry-driven, so it follows ADMIN_SECTIONS if the
// first section changes. Access control and noindex live in the layout gate
// (layout.tsx), which runs before this redirect.

export default function AdminHome() {
  redirect(ADMIN_SECTIONS[0]?.href ?? "/admin/starter-packs");
}
