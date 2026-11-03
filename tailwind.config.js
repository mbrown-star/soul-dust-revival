/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17231f",
        dusk: "#2a4038",
        parchment: "#f7f2e6",
        // Darkened slightly from the original #de3a2e: that shade measured
        // 3.96:1 contrast against `parchment` for normal-size text (fails
        // WCAG AA's 4.5:1), found via axe-core while this ran as text-ember
        // on parchment in ~20 places site-wide (nav links, "View all", etc).
        // This is the smallest darkening that clears 4.5:1 (4.57:1 measured),
        // keeping the same hue/saturation.
        ember: "#cc352a",
        gold: "#f0b93e",
        moss: "#4b6358",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        serif: ["var(--font-body)"],
        sans: ["var(--font-ui)"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
