/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Heebo/Assistant matches the other Klaser products' Hebrew type
      // choice — keep for brand consistency even before Meetings has its
      // own visual identity nailed down.
      fontFamily: {
        sans: ['"Heebo"', '"Assistant"', "system-ui", "sans-serif"],
        display: ['"Heebo"', '"Assistant"', "system-ui", "sans-serif"],
      },
      colors: {
        // Placeholder accent — swap once Meetings has its own brand color.
        // Deliberately different from Takanon's clay-red so the two
        // products are visually distinguishable in the product switcher.
        accent: {
          DEFAULT: "#2b6cb8",
          dark: "#1f4f92",
          light: "#5290d9",
        },
        ink: "#171717",
        "ink-soft": "#525252",
        surface: "#fafaf9",
        line: "#e7e5e4",
        "line-strong": "#d6d3d1",
      },
    },
  },
  plugins: [],
};
