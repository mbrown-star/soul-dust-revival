import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { posts, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

function postRequest(body: unknown, method: "POST" | "PATCH" = "POST") {
  return new NextRequest("https://example.com/api/admin/blog/posts", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin blog posts route", () => {
  let createdPostIds: string[];
  let adminUserId: string;
  let db: Db;

  afterEach(async () => {
    for (const id of createdPostIds ?? []) {
      await db.delete(posts).where(eq(posts.id, id));
    }
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
  });

  it("sanitizes a dangerous HTML tag out of the body on create", async () => {
    createdPostIds = [];
    db = await getDb();
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
      .returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });

    const res = await POST(
      postRequest({
        title: "Hello",
        slug: `hello-${randomUUID()}`,
        body: "<p>Some <strong>text</strong> and <script>alert('xss')</script> more</p>",
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; body: string };
    createdPostIds.push(json.id);
    expect(json.body).not.toContain("<script>");
    expect(json.body).toContain("Some <strong>text</strong> and");
  });

  it("sanitizes a dangerous HTML attribute out of the body on update", async () => {
    createdPostIds = [];
    db = await getDb();
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
      .returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });

    const [existing] = await db
      .insert(posts)
      .values({
        title: "Original",
        slug: `original-${randomUUID()}`,
        body: "<p>original body</p>",
        createdByUserId: adminUserId,
      })
      .returning();
    createdPostIds.push(existing!.id);

    const res = await PATCH(
      postRequest(
        { id: existing!.id, body: "<img src=x onerror=alert(1)>updated" },
        "PATCH"
      )
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { body: string };
    expect(json.body).not.toContain("onerror");
  });
});
