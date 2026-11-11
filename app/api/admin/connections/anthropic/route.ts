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

  // Verify the key actually works before saving it, so a typo'd key shows
  // up as an immediate error here instead of surfacing later as a mysterious
  // failure the next time a suggestion needs it. Listing models is free and
  // names no model, so this check can't break when a model is retired (the
  // previous check called a model that was retired on 2026-02-19).
  let testRes: Response;
  try {
    testRes = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: {
        "x-api-key": parsed.data.apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "anthropic_unreachable", message: "Couldn't reach Anthropic to check the key. Try again." },
      { status: 502 }
    );
  }

  if (testRes.status === 401 || testRes.status === 403) {
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
