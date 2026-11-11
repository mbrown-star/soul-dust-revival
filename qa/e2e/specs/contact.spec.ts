import { test, expect } from "@playwright/test";
import { formatViolations, runAxe } from "../fixtures/axe";

// The Contact page (app/(marketing)/contact) and its nav link: signed-in
// only. Submissions are intercepted here, never sent: the QA server has the
// real Resend key, and a real send would land in the real admin inbox. The
// route's own behavior (validation, screenshot checks, the email it builds)
// is covered by app/api/contact/route.test.ts.

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test.describe("Contact page", () => {
  test("guest is sent to log in", async ({ page }) => {
    await page.goto("/contact");
    await expect(page).toHaveURL(/\/login\?next=\/contact/);
  });

  test("guest's nav has no Contact link", async ({ page }, testInfo) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    if (testInfo.project.name === "mobile-chromium") {
      await nav.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("menuitem", { name: "Contact" })).toHaveCount(0);
    } else {
      await expect(nav.getByRole("link", { name: "Contact" })).toHaveCount(0);
    }
  });

  test.describe("as qa-user", () => {
    test.use({ storageState: "qa/.auth/user.json" });

    test("the nav's Contact link opens the form, email filled in", async ({ page }, testInfo) => {
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Primary" });
      if (testInfo.project.name === "mobile-chromium") {
        await nav.getByRole("button", { name: "Open menu" }).click();
        await page.getByRole("menuitem", { name: "Contact" }).click();
      } else {
        await nav.getByRole("link", { name: "Contact" }).click();
      }
      await expect(page).toHaveURL(/\/contact$/);
      await expect(page.getByRole("heading", { level: 1, name: "Contact" })).toBeVisible();
      await expect(page.getByLabel("Email")).toHaveValue("qa-user@soul-dust-revival.test");
    });

    test("sends name, email, message and screenshots, then thanks them", async ({ page }) => {
      let sent: { body: string; contentType: string } | null = null;
      await page.route("**/api/contact", async (route) => {
        const req = route.request();
        sent = { body: req.postDataBuffer()?.toString("latin1") ?? "", contentType: req.headers()["content-type"] ?? "" };
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });

      await page.goto("/contact");
      await page.getByLabel("Name").fill("Quinn Tester");
      await page.getByLabel(/Comments, feedback/).fill("The week picker overlaps the header on my phone.");
      await page.getByLabel(/Screenshots/).setInputFiles([
        { name: "first.png", mimeType: "image/png", buffer: PNG },
        { name: "second.png", mimeType: "image/png", buffer: PNG },
      ]);
      const attached = page.getByRole("list", { name: "Attached screenshots" });
      await expect(attached.getByRole("listitem")).toHaveCount(2);
      await page.getByRole("button", { name: "Remove second.png" }).click();
      await expect(attached.getByRole("listitem")).toHaveCount(1);

      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page.getByRole("heading", { name: /Your message is on its way/ })).toBeFocused();

      expect(sent).not.toBeNull();
      const { body, contentType } = sent!;
      expect(contentType).toMatch(/^multipart\/form-data/);
      expect(body).toContain("Quinn Tester");
      expect(body).toContain("qa-user@soul-dust-revival.test");
      expect(body).toContain("The week picker overlaps the header on my phone.");
      expect(body).toContain('filename="first.png"');
      expect(body).not.toContain('filename="second.png"');
    });

    test("a file over the size cap is refused before sending", async ({ page }) => {
      await page.goto("/contact");
      const big = Buffer.alloc(10 * 1024 * 1024 + 1);
      PNG.copy(big);
      await page.getByLabel(/Screenshots/).setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: big });
      await expect(page.locator("form").getByRole("alert")).toHaveText("Each screenshot can be up to 10 MB.");
      await expect(page.getByRole("list", { name: "Attached screenshots" })).toHaveCount(0);
    });

    test("a refused send shows the server's reason and keeps the message", async ({ page }) => {
      await page.route("**/api/contact", (route) =>
        route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "send_failed", message: "Your message didn't send. Please try again in a few minutes." }),
        })
      );
      await page.goto("/contact");
      await page.getByLabel(/Comments, feedback/).fill("Hello");
      await page.getByLabel("Name").fill("Quinn Tester");
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText("Your message didn't send. Please try again in a few minutes.");
      await expect(page.getByLabel(/Comments, feedback/)).toHaveValue("Hello");
    });

    test("has no axe violations", async ({ page }) => {
      await page.goto("/contact");
      const violations = await runAxe(page);
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  });
});
