/**
 * The one place this app talks to the Claude API for the admin's blog and
 * social draft suggestions. The admin's own API key comes from the
 * Settings → Connections page (stored encrypted, see lib/social/connections.ts),
 * so this takes the key as an argument rather than reading an env var.
 *
 * Model choice: the current Sonnet. Suggestions are short creative drafts,
 * so the request runs at low effort (cheaper and faster; adaptive thinking
 * is always on for this model and `low` keeps it brief). Change the model
 * here, not in the routes.
 */
export const SUGGESTION_MODEL = "claude-sonnet-5-5";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/**
 * If a safety classifier declines a request, the API retries it on a
 * fallback model inside the same call ("default" picks the model by the
 * decline's category). Opt-in, so it needs this beta flag.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type ClaudeTextResult =
  | { ok: true; text: string }
  | { ok: false; error: string; message: string };

type MessagesResponse = {
  content?: { type?: string; text?: string }[];
  stop_reason?: string | null;
  stop_details?: { explanation?: string | null } | null;
};

/**
 * Pulls the answer text out of a Messages API response. The answer is not
 * always the first block: with thinking on, a `thinking` block comes first
 * (and a `fallback` block can appear too), so this joins every `text` block.
 * A refusal or a reply cut off at max_tokens is reported as an error rather
 * than handed on as half a JSON array.
 */
export function extractClaudeText(data: MessagesResponse): ClaudeTextResult {
  if (data.stop_reason === "refusal") {
    return {
      ok: false,
      error: "refused",
      message: data.stop_details?.explanation || "Claude declined this request. Try different wording.",
    };
  }
  if (data.stop_reason === "max_tokens") {
    return {
      ok: false,
      error: "truncated",
      message: "Claude's reply was cut off before it finished. Try again, or ask for something shorter.",
    };
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) {
    return { ok: false, error: "empty_response", message: "Claude returned no text." };
  }
  return { ok: true, text };
}

/** Sends one system + user prompt and returns the reply's text. */
export async function requestClaudeText(opts: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<ClaudeTextResult> {
  let res: Response;
  try {
    res = await fetch(MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": opts.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": FALLBACK_BETA,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: SUGGESTION_MODEL,
        max_tokens: opts.maxTokens,
        output_config: { effort: "low" },
        fallbacks: "default",
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    });
  } catch {
    return { ok: false, error: "anthropic_unreachable", message: "Couldn't reach Claude. Try again in a moment." };
  }

  if (!res.ok) {
    if (res.status === 401) {
      return {
        ok: false,
        error: "invalid_api_key",
        message: "Claude rejected the saved API key. Reconnect Claude in Settings → Connections.",
      };
    }
    return { ok: false, error: "anthropic_request_failed", message: await res.text() };
  }

  return extractClaudeText((await res.json()) as MessagesResponse);
}
