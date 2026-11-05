import { getDb } from "@/lib/db/client";
import { integrationConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "@/lib/crypto/tokenCipher";

export type Provider = "anthropic" | "x" | "facebook" | "instagram";

export async function getConnection(provider: Provider) {
  const db = await getDb();
  const row = await db.query.integrationConnections.findFirst({
    where: eq(integrationConnections.provider, provider),
  });
  if (!row) return null;

  return {
    ...row,
    accessToken: row.accessTokenEncrypted ? decryptToken(row.accessTokenEncrypted) : null,
    refreshToken: row.refreshTokenEncrypted ? decryptToken(row.refreshTokenEncrypted) : null,
  };
}

export async function upsertConnection(params: {
  provider: Provider;
  displayName?: string | null;
  externalAccountId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  connectedByUserId?: string;
}) {
  const db = await getDb();
  const existing = await db.query.integrationConnections.findFirst({
    where: eq(integrationConnections.provider, params.provider),
  });

  const values = {
    provider: params.provider,
    displayName: params.displayName ?? null,
    externalAccountId: params.externalAccountId ?? null,
    accessTokenEncrypted: params.accessToken ? encryptToken(params.accessToken) : null,
    refreshTokenEncrypted: params.refreshToken ? encryptToken(params.refreshToken) : null,
    tokenExpiresAt: params.tokenExpiresAt ?? null,
    status: "connected" as const,
    lastError: null,
    connectedByUserId: params.connectedByUserId,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(integrationConnections).set(values).where(eq(integrationConnections.id, existing.id));
  } else {
    await db.insert(integrationConnections).values(values);
  }
}

export async function disconnectProvider(provider: Provider) {
  const db = await getDb();
  await db
    .update(integrationConnections)
    .set({
      status: "disconnected",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.provider, provider));
}

export async function markConnectionError(provider: Provider, message: string) {
  const db = await getDb();
  await db
    .update(integrationConnections)
    .set({ status: "error", lastError: message, updatedAt: new Date() })
    .where(eq(integrationConnections.provider, provider));
}
