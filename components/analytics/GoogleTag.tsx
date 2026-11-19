import Script from "next/script";
import { headers } from "next/headers";

/**
 * Google Tag Manager container (which carries the site's Google Analytics
 * tags), as Google's install snippet gives it.
 *
 * Rendered by the (marketing), (study-app) and leader layouts, deliberately
 * not the root or admin layout: admin pages show customer emails and orders,
 * and a GTM container can run any script its editors publish.
 *
 * Only rendered when NEXT_PUBLIC_GTM_ID is set at BUILD time. scripts/deploy
 * sets it for production only, so staging and local dev visits never reach
 * the live analytics property.
 *
 * Both scripts carry the per-request CSP nonce from proxy.ts: script-src is
 * nonce + 'strict-dynamic', so gtm.js must be nonced itself, and the GA
 * scripts it then injects are trusted through 'strict-dynamic'.
 *
 * Consent Mode defaults (there is no consent banner):
 * - Advertising signals (ad_storage, ad_user_data, ad_personalization) are
 *   denied everywhere: the privacy page says we don't use data for
 *   advertising.
 * - Analytics cookies (analytics_storage) are denied in the EEA, UK and
 *   Switzerland, where cookie law needs consent first, so Google's tags send
 *   cookieless pings there; granted everywhere else. See PRIVACY.md.
 */
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

// EU/EEA member states plus the UK and Switzerland (ISO 3166-1 alpha-2).
const CONSENT_REQUIRED_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
];

export async function GoogleTag() {
  // lib/env.ts also enforces this shape at boot; checked again here because
  // the ID is interpolated into an inline script.
  if (!GTM_ID || !/^GTM-[A-Z0-9]+$/.test(GTM_ID)) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const noAds = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  const inline = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', ${JSON.stringify({ ...noAds, analytics_storage: "denied", region: CONSENT_REQUIRED_REGIONS })});
gtag('consent', 'default', ${JSON.stringify({ ...noAds, analytics_storage: "granted" })});
gtag('js', new Date());
`;

  return (
    <>
      {/* Consent defaults must reach the dataLayer before gtm.js runs. */}
      <Script id="google-tag-init" strategy="afterInteractive" nonce={nonce}>
        {inline}
      </Script>
      <Script
        id="google-tag-manager"
        strategy="afterInteractive"
        nonce={nonce}
        src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
      />
    </>
  );
}
