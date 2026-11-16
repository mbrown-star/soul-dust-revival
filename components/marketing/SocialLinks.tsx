import { SOCIAL_PROFILES, type SocialPlatform } from "@/lib/social/profiles";

/** Brand marks, drawn inline so no icon package or outside request is needed.
 *  Facebook and X paths are from Simple Icons (CC0). */
function SocialIcon({ platform }: { platform: SocialPlatform }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false,
  } as const;

  switch (platform) {
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="currentColor">
          <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
        </svg>
      );
  }
}

/** Footer row of icon links to the social profiles in lib/social/profiles.ts. */
export function SocialLinks() {
  return (
    <ul aria-label="Follow Soul Dust Revival" className="flex items-center gap-2 -ml-3">
      {SOCIAL_PROFILES.map((profile) => (
        <li key={profile.platform}>
          <a
            href={profile.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Soul Dust Revival on ${profile.name} (opens in a new tab)`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-parchment/80 hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold"
          >
            <SocialIcon platform={profile.platform} />
          </a>
        </li>
      ))}
    </ul>
  );
}
