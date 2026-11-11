import { afterEach, describe, expect, it, vi } from "vitest";
import { extractClaudeText, requestClaudeText, SUGGESTION_MODEL } from "./claude";

describe("extractClaudeText", () => {
  it("skips a leading thinking block and returns the text", () => {
    // Regression: the routes used to read content[0].text, which is undefined
    // when thinking is on, so every suggestion came back as an empty list.
    const result = extractClaudeText({
      stop_reason: "end_turn",
      content: [{ type: "thinking" }, { type: "text", text: '["a","b"]' }],
    });
    expect(result).toEqual({ ok: true, text: '["a","b"]' });
  });

  it("ignores a fallback block and joins multiple text blocks", () => {
    const result = extractClaudeText({
      stop_reason: "end_turn",
      content: [{ type: "fallback" }, { type: "text", text: '["a",' }, { type: "text", text: '"b"]' }],
    });
    expect(result).toEqual({ ok: true, text: '["a","b"]' });
  });

  it("reports a refusal with its explanation", () => {
    const result = extractClaudeText({
      stop_reason: "refusal",
      stop_details: { explanation: "Not allowed" },
      content: [],
    });
    expect(result).toEqual({ ok: false, error: "refused", message: "Not allowed" });
  });

  it("reports a reply cut off at max_tokens", () => {
    const result = extractClaudeText({ stop_reason: "max_tokens", content: [{ type: "text", text: '["a' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("truncated");
  });

  it("reports an empty reply", () => {
    const result = extractClaudeText({ stop_reason: "end_turn", content: [{ type: "thinking" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("empty_response");
  });
});

describe("requestClaudeText", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the current model, low effort and the fallback opt-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestClaudeText({ apiKey: "sk-ant-test", system: "s", user: "u", maxTokens: 100 });

    expect(result).toEqual({ ok: true, text: "ok" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(SUGGESTION_MODEL);
    expect(SUGGESTION_MODEL).toBe("claude-sonnet-5-5");
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.fallbacks).toBe("default");
    expect((init.headers as Record<string, string>)["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
  });

  it("turns a 401 into a reconnect message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401 })));
    const result = await requestClaudeText({ apiKey: "bad", system: "s", user: "u", maxTokens: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_api_key");
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const result = await requestClaudeText({ apiKey: "k", system: "s", user: "u", maxTokens: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("anthropic_unreachable");
  });
});
