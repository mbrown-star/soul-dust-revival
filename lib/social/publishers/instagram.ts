export async function publishToInstagram(params: {
  pageAccessToken: string;
  igUserId: string;
  body: string;
  imageUrl: string; // Instagram's API requires an image — text-only posts aren't supported
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
  const { id: creationId } = await containerRes.json();

  // Step 2: publish the container.
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

  const data = await publishRes.json();
  return { externalPostId: data.id };
}
