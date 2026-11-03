import { db } from "@/lib/db/client";
import { integrationConnections } from "@/lib/db/schema";
import { ConnectionsPanel } from "@/components/admin/ConnectionsPanel";

export default async function ConnectionsPage() {
  const connections = await db.select().from(integrationConnections);

  const byProvider = Object.fromEntries(connections.map((c) => [c.provider, c]));

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Connections</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Connect the accounts used for AI post suggestions and scheduled social publishing.
        </p>
      </div>

      <ConnectionsPanel
        initial={{
          anthropic: byProvider.anthropic ?? null,
          x: byProvider.x ?? null,
          facebook: byProvider.facebook ?? null,
          instagram: byProvider.instagram ?? null,
        }}
      />
    </div>
  );
}
