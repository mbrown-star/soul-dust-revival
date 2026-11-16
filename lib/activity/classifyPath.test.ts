import { describe, expect, it } from "vitest";
import { classifyPath, sectionLabel } from "./classifyPath";

const LESSON = "3f2a1c4e-1b2c-4d5e-8f90-123456789abc";

describe("classifyPath", () => {
  it("puts the reading app's pages in the app, with their study and lesson", () => {
    expect(classifyPath("/library")).toEqual({ area: "app", section: "library" });
    expect(classifyPath("/studies/colossians")).toEqual({ area: "app", section: "study", studySlug: "colossians" });
    expect(classifyPath(`/studies/colossians/${LESSON}`)).toEqual({
      area: "app",
      section: "lesson",
      studySlug: "colossians",
      lessonId: LESSON,
    });
    expect(classifyPath("/journey/the-journey")).toEqual({ area: "app", section: "journey" });
    expect(classifyPath("/account")).toEqual({ area: "app", section: "account" });
  });

  it("puts the storefront, blog and other public pages on the website", () => {
    expect(classifyPath("/")).toEqual({ area: "website", section: "home" });
    expect(classifyPath("/store")).toEqual({ area: "website", section: "store" });
    expect(classifyPath("/store/revive-me")).toEqual({ area: "website", section: "store-product", productSlug: "revive-me" });
    expect(classifyPath("/blog/why")).toEqual({ area: "website", section: "blog-post" });
    expect(classifyPath("/claim")).toEqual({ area: "website", section: "claim" });
    expect(classifyPath("/no-such-page")).toEqual({ area: "website", section: "other" });
  });

  it("keeps Leader Resources and the admin apart", () => {
    expect(classifyPath("/leader")).toEqual({ area: "leader", section: "leader-home" });
    expect(classifyPath(`/leader/${LESSON}`)).toEqual({ area: "leader", section: "leader-resource" });
    expect(classifyPath("/admin/reports/engagement")).toEqual({ area: "admin", section: "reports" });
    expect(sectionLabel("admin", "leader-resources")).toBe("Admin: Leader resources");
  });

  it("ignores sign-in, auth and API pages, and query strings", () => {
    expect(classifyPath("/login")).toBeNull();
    expect(classifyPath("/signup")).toBeNull();
    expect(classifyPath("/auth/callback")).toBeNull();
    expect(classifyPath("/api/activity/ping")).toBeNull();
    expect(classifyPath("/store?q=psalm")).toEqual({ area: "website", section: "store" });
    expect(classifyPath("not-a-path")).toBeNull();
  });

  it("doesn't treat a non-id third segment as a lesson", () => {
    expect(classifyPath("/studies/colossians/not-an-id")).toEqual({ area: "app", section: "study", studySlug: "colossians" });
  });
});
