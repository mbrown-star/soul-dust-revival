import { requireAdmin } from "@/lib/admin/guard";
import { redirect } from "next/navigation";
import { UserRoleTable } from "@/components/admin/UserRoleTable";
import { listUsersForAdmin } from "@/lib/admin/listUsers";
import { listBlockedEmails } from "@/lib/auth/blockedEmails";

export default async function AdminUsersPage() {
  const session = await requireAdmin();
  if (!session) redirect("/login?next=/admin/users");

  const [allUsers, blocked] = await Promise.all([listUsersForAdmin(), listBlockedEmails()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Users &amp; roles</h1>
        <p className="text-sm text-moss mt-1">
          Admins get full admin access. Leaders get the leader resource section. Users
          get regular studies/books access. You can&apos;t change your own role here —
          have another admin do it if that&apos;s ever needed. Delete removes an account; it
          can also block the email so it can&apos;t be used to sign up again.
        </p>
      </div>

      <UserRoleTable
        initialUsers={allUsers.map((u) => ({
          ...u,
          createdAt: u.createdAt ? u.createdAt.toISOString() : null,
        }))}
        initialBlocked={blocked.map((b) => ({
          ...b,
          createdAt: b.createdAt ? b.createdAt.toISOString() : null,
        }))}
        currentUserId={session.userId}
      />
    </div>
  );
}
