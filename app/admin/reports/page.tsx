import Link from "next/link";

export default function ReportsIndexPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reports</h1>
      <div className="divide-y border rounded-lg">
        <Link href="/admin/reports/sales" className="block p-4 hover:bg-moss/5">
          <p className="font-medium">Sales</p>
          <p className="text-sm text-moss">Who purchased what, when, and from where.</p>
        </Link>
        <Link href="/admin/reports/amazon-claims" className="block p-4 hover:bg-moss/5">
          <p className="font-medium">Amazon claims</p>
          <p className="text-sm text-moss">Digital editions unlocked with an Amazon order number, to review or revoke.</p>
        </Link>
        <Link href="/admin/reports/engagement" className="block p-4 hover:bg-moss/5">
          <p className="font-medium">Engagement</p>
          <p className="text-sm text-moss">Login frequency and approximate session length per user.</p>
        </Link>
        <Link href="/admin/reports/social" className="block p-4 hover:bg-moss/5">
          <p className="font-medium">Social analytics</p>
          <p className="text-sm text-moss">Likes, comments, and shares on published social posts.</p>
        </Link>
      </div>
    </div>
  );
}
