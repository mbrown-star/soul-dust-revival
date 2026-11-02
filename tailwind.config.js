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
        ember: "#de3a2e",
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
