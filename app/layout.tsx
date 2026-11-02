import { CartProvider } from "@/lib/cart/CartContext";
import type { Viewport } from "next";
import { Fraunces, Source_Serif_4, Archivo } from "next/font/google";
import "./globals.css";

// Display face: carries the weight/character of the brand (headlines, wordmark).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "900"],
  style: ["normal", "italic"],
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
    <html lang="en" className={`${fraunces.variable} ${sourceSerif.variable} ${archivo.variable}`}>
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
