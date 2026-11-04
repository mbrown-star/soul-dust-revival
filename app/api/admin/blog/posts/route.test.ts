import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
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

  afterEach(async () => {
    for (const id of createdPostIds ?? []) {
      await db.delete(posts).where(eq(posts.id, id));
    }
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
  });

  it("sanitizes raw HTML out of the markdown body on create", async () => {
    createdPostIds = [];
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
        body: "Some **markdown** and <script>alert('xss')</script> text",
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; body: string };
    createdPostIds.push(json.id);
    expect(json.body).not.toContain("<script>");
    expect(json.body).toContain("Some **markdown** and");
  });

  it("sanitizes raw HTML out of the markdown body on update", async () => {
    createdPostIds = [];
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
        body: "original body",
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
