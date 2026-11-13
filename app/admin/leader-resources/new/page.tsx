import Link from "next/link";
import { NewLeaderResourceForm } from "@/components/admin/NewLeaderResourceForm";

export default function NewLeaderResourcePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/leader-resources" className="text-sm text-moss">
          ← Leader Resources
        </Link>
        <h1 className="text-xl font-semibold">New leader resource</h1>
      </div>
      <NewLeaderResourceForm />
    </div>
  );
}
