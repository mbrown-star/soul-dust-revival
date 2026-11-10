import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { responses } from "@/lib/db/schema";
import { createSampleStudyFixture } from "@/lib/testing/sampleStudyFixture";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");

function answer(contentBlockId: string) {
  return new NextRequest("https://example.com/api/responses", {
    method: "POST",
    body: JSON.stringify({ contentBlockId, answerText: "An answer" }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/responses -- free-sample reader", () => {
  let fixture: Awaited<ReturnType<typeof createSampleStudyFixture>>;

  afterEach(async () => {
    await fixture?.cleanup();
    vi.mocked(getSession).mockReset();
  });

  it("saves an answer on a sample lesson, and refuses one on a locked lesson of the same study", async () => {
    fixture = await createSampleStudyFixture();
    vi.mocked(getSession).mockResolvedValue(fixture.session);

    expect((await POST(answer(fixture.sampleBlockId))).status).toBe(200);
    expect((await POST(answer(fixture.lockedBlockId))).status).toBe(403);

    const db = await getDb();
    expect(await db.select().from(responses).where(eq(responses.contentBlockId, fixture.lockedBlockId))).toHaveLength(0);
  });

  it("rejects an unauthenticated request", async () => {
    fixture = await createSampleStudyFixture();
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(answer(fixture.sampleBlockId))).status).toBe(401);
  });
});
