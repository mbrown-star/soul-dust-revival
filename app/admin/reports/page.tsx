import Link from "next/link";

export default function ReportsIndexPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reports</h1>
      <div className="divide-y border rounded-lg">
        <Link href="/admin/reports/sales" className="block p-4 hover:bg-neutral-50">
          <p className="font-medium">Sales</p>
          <p className="text-sm text-neutral-600">Who purchased what, when, and from where.</p>
        </Link>
        <Link href="/admin/reports/engagement" className="block p-4 hover:bg-neutral-50">
          <p className="font-medium">Engagement</p>
          <p className="text-sm text-neutral-600">Login frequency and approximate session length per user.</p>
        </Link>
        <Link href="/admin/reports/social" className="block p-4 hover:bg-neutral-50">
          <p className="font-medium">Social analytics</p>
          <p className="text-sm text-neutral-600">Likes, comments, and shares on published social posts.</p>
        </Link>
      </div>
    </div>
  );
}
