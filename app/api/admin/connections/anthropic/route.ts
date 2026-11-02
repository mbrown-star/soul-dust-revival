import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { upsertConnection } from "@/lib/social/connections";
import { anthropicKeySchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = anthropicKeySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  // Verify the key actually works before saving it — a single lightweight
  // call rather than trusting an unvalidated string, so a typo'd key shows
  // up as an immediate error here instead of surfacing later as a mysterious
  // failure the next time a suggestion or scheduled action needs it.
  const testRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": parsed.data.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });

  if (!testRes.ok && testRes.status === 401) {
    return NextResponse.json({ error: "invalid_api_key", message: "That API key was rejected." }, { status: 400 });
  }

  await upsertConnection({
    provider: "anthropic",
    displayName: "Anthropic API",
    accessToken: parsed.data.apiKey,
    connectedByUserId: session.userId,
  });

  return NextResponse.json({ ok: true });
}
