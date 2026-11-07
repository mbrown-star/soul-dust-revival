import type { Page } from "@playwright/test";

/**
 * Delays matching requests before letting them through, to simulate a real
 * mobile connection's latency in tests that would otherwise run against a
 * local dev server's near-zero round trip.
 *
 * Deliberately NOT built on Chrome DevTools Protocol's
 * `Network.emulateNetworkConditions` -- that's Chromium-only and wouldn't
 * run at all under the `mobile-webkit` project (see playwright.config.ts),
 * which is the whole point of this suite's timing-sensitive tests: WebKit's
 * own, stricter request-cancellation behavior around navigation is
 * specifically what a Chromium-only throttle can't help test. Route
 * interception with a plain `setTimeout` works identically across every
 * engine Playwright supports.
 *
 * Found necessary the hard way: a real bug (an answer typed into a question
 * block could be lost if the reader navigated away immediately after
 * typing) was invisible to every existing test because a save to the local
 * dev server completes in single-digit milliseconds -- no realistic amount
 * of "navigate immediately" gives a real browser's request-cancellation
 * behavior any actual window to act in. This closes that gap by putting a
 * realistic amount of latency back in deliberately. See
 * qa/CONVENTIONS.md "Testing for race conditions" for when to reach for
 * this.
 */
export async function simulateSlowNetwork(page: Page, urlPattern: string | RegExp, delayMs = 1500): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    // A route can be superseded (e.g. by the very navigation this delay is
    // meant to race against) between the delay ending and continue()
    // running -- harmless either way (the request already got through via
    // keepalive, or Playwright already finished handling it), so this
    // shouldn't fail the test it's used in.
    await route.continue().catch(() => {});
  });
}

/** Removes a throttle added by simulateSlowNetwork, once a test no longer needs it. */
export async function clearSlowNetwork(page: Page, urlPattern: string | RegExp): Promise<void> {
  await page.unroute(urlPattern);
}
