/**
 * POSTs to a same-origin route, retrying when the request never got an
 * answer (fetch threw) or the server answered with a 5xx. Any other answer,
 * a 4xx included, is returned as is: those are decisions, not glitches.
 *
 * Why: right after a sign-in code is verified, AuthForm POSTs to
 * /api/auth/login-recorded. On a phone the visitor has just switched to
 * their mail app for the code and back, and the browser may send that POST
 * on a connection that went stale in the background. Browsers resend only
 * safe requests (GET) on a stale connection, never a POST, so the first try
 * can fail outright ("Load failed") while a second one succeeds. A real
 * sign-up hit exactly this on 2026-11-12 and was left with no `users` row.
 *
 * The route is safe to repeat: the `users` insert ignores an existing row;
 * a repeat only adds a second login event for the same sign-in.
 */
export const LOGIN_RECORD_RETRY_DELAYS_MS = [400, 1200] as const;

export async function postWithRetry(
  url: string,
  {
    delaysMs = LOGIN_RECORD_RETRY_DELAYS_MS,
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: {
    delaysMs?: readonly number[];
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const isLast = attempt >= delaysMs.length;
    try {
      const res = await fetchImpl(url, { method: "POST" });
      if (res.status < 500 || isLast) return res;
    } catch (err) {
      if (isLast) throw err;
    }
    await sleep(delaysMs[attempt] ?? 0);
  }
}
