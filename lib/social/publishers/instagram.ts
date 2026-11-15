/** How long to wait for Instagram to finish processing a container before publishing it. */
export const CONTAINER_POLL_INTERVAL_MS = 2000;
export const CONTAINER_POLL_ATTEMPTS = 15;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Instagram processes a new container's image asynchronously: publishing
 * before it reports FINISHED fails with "Media ID is not available" (code
 * 9007, subcode 2207027 -- found 2026-11-15 on the first real scheduled
 * post). Waits until it's FINISHED; throws on ERROR/EXPIRED or if it never
 * finishes.
 */
async function waitForContainer(creationId: string, accessToken: string, intervalMs: number): Promise<void> {
  for (let attempt = 0; attempt < CONTAINER_POLL_ATTEMPTS; attempt++) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Instagram container status check failed: ${res.status} ${detail}`);
    }
    const { status_code: status } = (await res.json()) as { status_code?: string };
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Instagram couldn't process the image (container status ${status})`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Instagram was still processing the image after ${CONTAINER_POLL_ATTEMPTS} checks`);
}

export async function publishToInstagram(params: {
  pageAccessToken: string;
  igUserId: string;
  body: string;
  imageUrl: string; // Instagram's API requires an image — text-only posts aren't supported
  pollIntervalMs?: number; // tests only
}): Promise<{ externalPostId: string }> {
  // Step 1: create a media container. Instagram requires the image to be
  // reachable at a public URL — this is exactly what R2's public bucket
  // already gives us, so no extra upload step is needed here.
  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${params.igUserId}/media`, {
    method: "POST",
    body: new URLSearchParams({
      image_url: params.imageUrl,
      caption: params.body,
      access_token: params.pageAccessToken,
    }),
  });

  if (!containerRes.ok) {
    const detail = await containerRes.text();
    throw new Error(`Instagram container creation failed: ${containerRes.status} ${detail}`);
  }
  const { id: creationId } = (await containerRes.json()) as { id: string };

  // Step 2: wait for Instagram to finish processing the image.
  await waitForContainer(creationId, params.pageAccessToken, params.pollIntervalMs ?? CONTAINER_POLL_INTERVAL_MS);

  // Step 3: publish the container.
  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${params.igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: creationId,
      access_token: params.pageAccessToken,
    }),
  });

  if (!publishRes.ok) {
    const detail = await publishRes.text();
    throw new Error(`Instagram publish failed: ${publishRes.status} ${detail}`);
  }

  const data = (await publishRes.json()) as { id: string };
  return { externalPostId: data.id };
}
