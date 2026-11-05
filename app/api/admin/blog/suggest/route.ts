import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getConnection } from "@/lib/social/connections";
import { gatherProjectContext } from "@/lib/ai/projectContext";
import { blogSuggestSchema } from "@/lib/validation/schemas";

/**
 * Generates full blog post drafts (title + HTML body) grounded in this
 * project's own recent studies/lessons/posts — same context source as the
 * social suggestion endpoint, so both draw from the same notion of
 * "current project content." The body is HTML, not markdown, since it's
 * loaded straight into the admin's Tiptap rich text editor
 * (components/admin/BlogPostForm.tsx) and stored that way (see
 * lib/db/schema.ts's posts.body comment).
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = blogSuggestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { customInstruction } = parsed.data;

  const connection = await getConnection("anthropic");
  if (!connection || !connection.accessToken) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect Claude in Settings → Connections first." },
      { status: 400 }
    );
  }

  const context = await gatherProjectContext();

  const systemPrompt = `You write blog posts for Soul Dust Revival, a Christian men's discipleship platform centered on Psalm 119:25 ("My soul cleaves to the dust; Revive me according to Your word."). Voice: direct, honest, unadorned, first-person-plural or direct-address — never sales-y, no filler introductions, get to the point in the first sentence.

Respond with ONLY a JSON array of 3 draft objects, nothing else — no preamble, no markdown code fences. Each object must have exactly these keys: "title" (a short, direct headline, no colons-as-clickbait), "body" (300-600 words as semantic HTML — a few "<p>" paragraphs, may use an "<h2>" or two, "<strong>"/"<em>" for emphasis; no "<script>", inline styles, or other markup beyond plain semantic text tags; no bullet-point-stuffed "<ul>" listicle structure unless the content is genuinely a list).`;

  const userPrompt = [
    `Project context:\n${context}`,
    customInstruction ? `Additional instruction: ${customInstruction}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": connection.accessToken,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: "anthropic_request_failed", message: detail }, { status: 502 });
  }

  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? "[]";

  let drafts: { title: string; body: string }[];
  try {
    drafts = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "unparseable_response", message: text }, { status: 502 });
  }

  return NextResponse.json({ drafts });
}
