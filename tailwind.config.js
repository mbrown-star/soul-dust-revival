/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sunset palette, canonical per the design system since 2026-10-01
        // (replaces the earlier ink #17231f / dusk #2a4038 / parchment
        // #f7f2e6 / ember #cc352a / gold #f0b93e / moss #4b6358 / Fraunces
        // set, retired the same day).
        ink: "#1a120c",
        dusk: "#3a281c",
        parchment: "#f7ecd8",
        // 2.62:1 on parchment — fills, gradients and large display type only.
        // For accent text use ember-700; for body-size text use ink or moss.
        ember: "#e2762c",
        // 4.27:1 on parchment — clears AA's 3:1 "large text" threshold
        // (18px+, or 14px+ bold) but not the 4.5:1 normal-text threshold.
        "ember-700": "#b8501f",
        // 1.39:1 on parchment — fills, the wordmark gradient and the focus
        // ring on dark grounds only; never text or a focus ring on light
        // grounds. For accent text on parchment use gold-700.
        gold: "#f6c453",
        // 4.53:1 on parchment — passes AA for body-size gold-family accent
        // text/links, mirroring ember-700.
        "gold-700": "#8d6407",
        moss: "#6b5344",
        // 5.78:1 on parchment — error/alert text and states at any size.
        error: "#a8301c",
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
