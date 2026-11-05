import { CartProvider } from "@/lib/cart/CartContext";
import type { Metadata, Viewport } from "next";
import { Anton, Source_Serif_4, Archivo } from "next/font/google";
import "./globals.css";

// Fallback title/description for every page that doesn't set its own —
// without this, pages with no `metadata` export render with no <title> at
// all (confirmed with axe-core: a real WCAG 2.4.2 "Documents must have
// <title>" violation, not just a style nicety). Pages that do set their own
// short `title` (e.g. "Login") get it interpolated into this template
// rather than needing to repeat "— Soul Dust Revival" themselves.
export const metadata: Metadata = {
  title: {
    default: "Soul Dust Revival",
    template: "%s — Soul Dust Revival",
  },
  description:
    "Studies, devotionals, and a discipleship path for men willing to be honest about the dust — and willing to be revived.",
};

// Display face: carries the weight/character of the brand (headlines, wordmark).
// Anton is a single-weight (400), upright-only condensed face — there's no
// 600/900/italic to request, unlike the Fraunces set it replaces.
const anton = Anton({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400"],
});

// Body face: this app's actual job is long-form reading (studies, devotionals,
// blog posts), so body text uses a serif built for on-screen reading, not a
// generic UI sans stretched over paragraphs.
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

// UI face: sturdy grotesk for nav/buttons/labels, pairing with the
// badge/patch visual world already established in the logo work.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-ui",
  weight: ["500", "600", "700"],
});

// Explicit responsive viewport config — without this, mobile browsers may
// render at a desktop-width virtual viewport and scale down, which defeats
// every responsive breakpoint below and makes text/tap-targets tiny.
// maximumScale/userScalable are deliberately left unset (i.e. unrestricted)
// so users can still pinch-zoom — locking zoom out is a WCAG 1.4.4 violation.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${sourceSerif.variable} ${archivo.variable}`}>
      <body className="font-serif bg-parchment text-ink">
        {/* Skip link: first focusable element, lets keyboard/screen-reader
            users jump past repeated nav straight to page content (WCAG 2.4.1). */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <CartProvider>
          <main id="main-content">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
