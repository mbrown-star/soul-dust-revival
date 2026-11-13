import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getConnection } from "@/lib/social/connections";
import { gatherProjectContext } from "@/lib/ai/projectContext";
import { requestClaudeText } from "@/lib/ai/claude";
import { socialSuggestSchema } from "@/lib/validation/schemas";
import { PLATFORM_LIMITS } from "@/lib/data/socialPlatforms";

/**
 * Generates draft post text grounded in this project's own recent content
 * — published blog posts, and published studies including a sample of
 * their actual lesson content, not just the study's title/description —
 * rather than a generic prompt. "Based on a Project" here means based on
 * Soul Dust Revival's actual content, not Claude.ai's Projects feature
 * specifically, since that has no API for fetching project knowledge
 * programmatically.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = socialSuggestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { customInstruction, platforms } = parsed.data;

  const connection = await getConnection("anthropic");
  if (!connection || !connection.accessToken) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect Claude in Settings → Connections first." },
      { status: 400 }
    );
  }

  const context = await gatherProjectContext();

  const limitsNote = platforms.map((p) => `${p}: ${PLATFORM_LIMITS[p]} characters max`).join(", ");

  const systemPrompt = `You write social media posts for Soul Dust Revival, a Christian men's discipleship platform centered on Psalm 119:25 ("My soul clings to the dust; Revive me according to Your word.", NKJV). Voice: direct, honest, unadorned — never sales-y, never using more than one exclamation point in a post, no hashtag stuffing (0-2 relevant hashtags at most).

Respond with ONLY a JSON array of 3 draft post strings, nothing else — no preamble, no markdown code fences. Each draft must independently satisfy the strictest of these limits: ${limitsNote}.`;

  const userPrompt = [
    `Project context:\n${context}`,
    customInstruction ? `Additional instruction: ${customInstruction}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await requestClaudeText({
    apiKey: connection.accessToken,
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 4096,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: 502 });
  }
  const text = result.text;

  let drafts: string[];
  try {
    drafts = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "unparseable_response", message: text }, { status: 502 });
  }

  return NextResponse.json({ drafts });
}
