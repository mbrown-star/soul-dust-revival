import { isAppPath } from "@/lib/domains";

/**
 * Where a page sits, for the activity history (activity_visits): the area
 * (the marketing website, the reading app, Leader Resources or the admin) and
 * a section within it, plus the slug or id of the study, lesson or product
 * the page is about, when it's about one. Pages that aren't worth logging
 * (sign-in, sign-up, API and auth routes) return null.
 *
 * The app/website split follows lib/domains.ts (the same rule that decides
 * which host serves a page), so "app" here means exactly what
 * app.souldustrevival.com serves.
 */

export type ActivityArea = "website" | "app" | "leader" | "admin";

/** In report order. */
export const ACTIVITY_AREAS: ActivityArea[] = ["website", "app", "leader", "admin"];

export type ClassifiedPath = {
  area: ActivityArea;
  section: string;
  studySlug?: string;
  lessonId?: string;
  productSlug?: string;
};

export const MAX_TRACKED_PATH_LENGTH = 300;

const UNTRACKED_PREFIXES = ["/api", "/auth", "/login", "/signup"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function classifyPath(rawPath: string): ClassifiedPath | null {
  // Path only: a query string or fragment never reaches the database.
  const path = rawPath.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/") || path.length > MAX_TRACKED_PATH_LENGTH) return null;
  const segments = path.split("/").filter(Boolean);
  const [first, second, third] = segments;
  const top = `/${first ?? ""}`;

  if (UNTRACKED_PREFIXES.some((p) => top === p)) return null;

  if (first === "admin") {
    return { area: "admin", section: second ?? "home" };
  }

  if (first === "leader") {
    return { area: "leader", section: second ? "leader-resource" : "leader-home" };
  }

  if (isAppPath(path)) {
    switch (first) {
      case "library":
        return { area: "app", section: "library" };
      case "account":
        return { area: "app", section: "account" };
      case "journey":
        return { area: "app", section: "journey" };
      case "studies":
        if (second && third && isUuid(third)) {
          return { area: "app", section: "lesson", studySlug: second, lessonId: third };
        }
        if (second) return { area: "app", section: "study", studySlug: second };
        return { area: "app", section: "library" };
      default:
        return { area: "app", section: "other" };
    }
  }

  switch (first) {
    case undefined:
      return { area: "website", section: "home" };
    case "store":
      return second
        ? { area: "website", section: "store-product", productSlug: second }
        : { area: "website", section: "store" };
    case "blog":
      return { area: "website", section: second ? "blog-post" : "blog" };
    case "checkout":
    case "claim":
    case "contact":
    case "privacy":
    case "sneak-peek":
      return { area: "website", section: first };
    default:
      return { area: "website", section: "other" };
  }
}

export const AREA_LABELS: Record<ActivityArea, string> = {
  website: "Website",
  app: "App",
  leader: "Leader Resources",
  admin: "Admin",
};

const SECTION_LABELS: Record<string, string> = {
  home: "Homepage",
  store: "Store",
  "store-product": "Store page",
  blog: "Blog",
  "blog-post": "Blog post",
  checkout: "Checkout",
  claim: "Claim (Amazon)",
  contact: "Contact",
  privacy: "Privacy",
  "sneak-peek": "Sneak peek",
  library: "My Library",
  account: "Account",
  journey: "The Journey",
  study: "Study contents",
  lesson: "Lesson",
  "leader-home": "Leader Resources",
  "leader-resource": "Leader resource",
  other: "Other page",
};

export function sectionLabel(area: ActivityArea, section: string): string {
  if (area === "admin") {
    const name = section === "home" ? "Admin" : section.replace(/-/g, " ");
    return `Admin: ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  return SECTION_LABELS[section] ?? section;
}
