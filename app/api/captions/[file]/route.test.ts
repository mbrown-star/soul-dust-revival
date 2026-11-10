import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const file = "11111111-1111-4111-8111-111111111111.vtt";
const call = (name: string) => GET(new Request(`https://example.com/api/captions/${name}`), { params: Promise.resolve({ file: name }) });

describe("GET /api/captions/[file]", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-abc.r2.dev");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("proxies an uploaded captions file from the R2 bucket as text/vtt", async () => {
    fetchMock.mockResolvedValue(new Response("WEBVTT\n\n00:00.000 --> 00:01.000\nHello", { status: 200 }));
    const res = await call(file);
    expect(fetchMock).toHaveBeenCalledWith(`https://pub-abc.r2.dev/captions/${file}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/vtt");
    expect(await res.text()).toContain("WEBVTT");
  });

  it("refuses any name that isn't an uploaded captions file, without fetching", async () => {
    for (const name of ["../secret.vtt", "a.vtt", `${file}.html`, "11111111-1111-4111-8111-111111111111.txt"]) {
      expect((await call(name)).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 404 when the file isn't in the bucket", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    expect((await call(file)).status).toBe(404);
  });
});
