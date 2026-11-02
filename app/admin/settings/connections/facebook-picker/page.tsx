import { cookies } from "next/headers";
import { decryptToken } from "@/lib/crypto/tokenCipher";
import { requireAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
import { FacebookPagePickerForm } from "@/components/admin/FacebookPagePickerForm";

export default async function FacebookPagePickerPage() {
  const session = await requireAdmin();
  if (!session) redirect("/login?next=/admin/settings/connections");

  const cookieStore = await cookies();
  const encrypted = cookieStore.get("fb_pending_pages")?.value;

  if (!encrypted) {
    redirect("/admin/settings/connections?error=facebook_picker_expired");
  }

  let pages: { id: string; name: string }[];
  try {
    const decrypted = JSON.parse(decryptToken(encrypted));
    pages = decrypted.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
  } catch {
    redirect("/admin/settings/connections?error=facebook_picker_expired");
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Choose a Facebook Page</h1>
      <p className="text-sm text-neutral-500">
        This account manages more than one Page — choose which one to connect for
        scheduled posts.
      </p>
      <FacebookPagePickerForm pages={pages} />
    </div>
  );
}
