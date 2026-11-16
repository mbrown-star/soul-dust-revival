/** Soul Dust Revival's public social profiles, linked from the site footer.
 *  Change an address here; the footer reads only this list. */
export type SocialPlatform = "facebook" | "instagram" | "x";

export type SocialProfile = {
  platform: SocialPlatform;
  /** Shown to screen readers: "Soul Dust Revival on {name}". */
  name: string;
  url: string;
};

export const SOCIAL_PROFILES: readonly SocialProfile[] = [
  {
    platform: "facebook",
    name: "Facebook",
    url: "https://www.facebook.com/profile.php?id=61595896905911",
  },
  {
    platform: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com/souldustrevival/",
  },
  { platform: "x", name: "X", url: "https://x.com/souldustrevival" },
];
