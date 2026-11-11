import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");

const PNG_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7]);

type Fields = { name?: string; email?: string; message?: string; page?: string };

async function message(res: Response): Promise<string> {
  return ((await res.json()) as { message: string }).message;
}

function request(fields: Fields, files: { bytes: Uint8Array; name: string; type: string }[] = []) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.set(key, value);
  for (const f of files) form.append("screenshots", new File([f.bytes as Uint8Array<ArrayBuffer>], f.name, { type: f.type }));
  return new NextRequest("https://example.com/api/contact", { method: "POST", body: form });
}

const valid: Fields = { name: "Ruth Reader", email: "ruth@example.com", message: "The Week 3 page won't load." };

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
    vi.mocked(getSession).mockResolvedValue({ userId: "user-1", email: "ruth@example.com" });
  });

  it("refuses a visitor who isn't signed in, sending nothing", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(request(valid));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("emails the message to the admin inbox, replying to the sender", async () => {
    const res = await POST(request({ ...valid, page: "https://souldustrevival.com/store" }));
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const email = sendMock.mock.calls[0]![0];
    expect(email.to).toBe("admin@souldustrevival.com");
    expect(email.replyTo).toBe("ruth@example.com");
    expect(email.subject).toBe("Contact form: Ruth Reader");
    expect(email.html).toContain("The Week 3 page won&#39;t load.");
    expect(email.html).toContain("Sent from https://souldustrevival.com/store");
    expect(email.html).not.toContain("Signed in as");
    expect(email.attachments).toEqual([]);
  });

  it("attaches screenshots under our own names, by their real type", async () => {
    const res = await POST(
      request(valid, [
        { bytes: PNG_BYTES, name: "../../etc/passwd.png", type: "image/png" },
        { bytes: JPEG_BYTES, name: "photo.png", type: "image/png" },
      ])
    );
    expect(res.status).toBe(200);
    const { attachments } = sendMock.mock.calls[0]![0];
    expect(attachments).toEqual([
      { filename: "screenshot-1.png", content: Buffer.from(PNG_BYTES).toString("base64") },
      { filename: "screenshot-2.jpg", content: Buffer.from(JPEG_BYTES).toString("base64") },
    ]);
  });

  it("escapes HTML in every field and notes a different signed-in account", async () => {
    await POST(
      request({
        name: "<b>Eve</b>",
        email: "other@example.com",
        message: "<script>alert(1)</script>\nsecond line",
      })
    );
    const { html } = sendMock.mock.calls[0]![0];
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br/>second line");
    expect(html).toContain("Signed in as ruth@example.com");
  });

  it("drops a page value that isn't an http(s) URL", async () => {
    await POST(request({ ...valid, page: "javascript:alert(1)" }));
    expect(sendMock.mock.calls[0]![0].html).not.toContain("Sent from");
  });

  it("refuses a file that isn't really an image, whatever it claims", async () => {
    const res = await POST(
      request(valid, [{ bytes: new TextEncoder().encode("<html>not an image</html>"), name: "x.png", type: "image/png" }])
    );
    expect(res.status).toBe(400);
    expect(await message(res)).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses more than five screenshots", async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ bytes: PNG_BYTES, name: `${i}.png`, type: "image/png" }));
    const res = await POST(request(valid, files));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("You can attach up to 5 screenshots.");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("refuses a screenshot over the size cap", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG_BYTES);
    const res = await POST(request(valid, [{ bytes: big, name: "big.png", type: "image/png" }]));
    expect(res.status).toBe(400);
    expect(await message(res)).toBe("Each screenshot can be up to 10 MB.");
  });

  it("refuses a body declared larger than the total cap before reading it", async () => {
    const req = request(valid);
    const res = await POST(
      new NextRequest(req, { headers: { "content-length": String(30 * 1024 * 1024) } })
    );
    expect(res.status).toBe(413);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...valid, name: "  " }, "Please enter your name"],
    [{ ...valid, email: "not-an-email" }, "Please enter a valid email address"],
    [{ ...valid, message: "" }, "Please enter a message"],
    [{ ...valid, message: "x".repeat(5_001) }, undefined],
  ])("refuses missing or bad fields (%#)", async (fields, expected) => {
    const res = await POST(request(fields));
    expect(res.status).toBe(400);
    if (expected) expect(await message(res)).toBe(expected);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports a send failure instead of claiming success", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified", name: "validation_error" } });
    const res = await POST(request(valid));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe("send_failed");
  });
});
