import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { decryptToken } from "@/lib/crypto/tokenCipher";
import { finalizeFacebookConnection, type FacebookPageOption } from "@/lib/social/finalizeFacebookConnection";
import { z } from "zod";

const schema = z.object({ pageId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const encrypted = req.cookies.get("fb_pending_pages")?.value;
  if (!encrypted) {
    return NextResponse.json(
      { error: "expired", message: "That selection expired — reconnect Facebook to try again." },
      { status: 400 }
    );
  }

  let pages: FacebookPageOption[];
  try {
    pages = JSON.parse(decryptToken(encrypted));
  } catch {
    return NextResponse.json({ error: "expired", message: "That selection expired." }, { status: 400 });
  }

  const page = pages.find((p) => p.id === parsed.data.pageId);
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await finalizeFacebookConnection(page, session.userId);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("fb_pending_pages");
  return response;
}
