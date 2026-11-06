import { redirect } from "next/navigation";

// "My Library" (see app/(study-app)/library/page.tsx) replaced this page as
// the logged-in destination; kept as a redirect so old bookmarks and
// `?next=/studies` login links still land somewhere useful.
export default function StudiesIndexRedirect() {
  redirect("/library");
}
