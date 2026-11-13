import { redirect } from "next/navigation";

// /admin had no page of its own and returned 404 (staging audit,
// 2026-11-13). The admin layout still checks the role before this runs, so
// a non-admin is sent to sign in, not here.
export default function AdminHomePage() {
  redirect("/admin/products");
}
