export async function publishToFacebook(params: {
  pageAccessToken: string;
  pageId: string;
  body: string;
  imageUrl?: string | null;
}): Promise<{ externalPostId: string }> {
  const url = params.imageUrl
    ? `https://graph.facebook.com/v21.0/${params.pageId}/photos`
    : `https://graph.facebook.com/v21.0/${params.pageId}/feed`;

  const body = new URLSearchParams({
    access_token: params.pageAccessToken,
    ...(params.imageUrl
      ? { url: params.imageUrl, caption: params.body }
      : { message: params.body }),
  });

  const res = await fetch(url, { method: "POST", body });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Facebook post failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  // The /photos endpoint returns { id, post_id }; /feed returns just { id }.
  return { externalPostId: data.post_id ?? data.id };
}
