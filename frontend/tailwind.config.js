/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Heebo"', '"Assistant"', "system-ui", "sans-serif"],
        display: ['"Heebo"', '"Assistant"', "system-ui", "sans-serif"],
        // Klaser DS — Rubik for display/H*/Caption/Small; Heebo for Body/Body 2
        rubik: ['"Rubik"', '"Heebo"', "system-ui", "sans-serif"],
      },
      colors: {
        accent: {
          DEFAULT: "#19819A",
          dark: "#166b80",
          light: "#d96a52", // legacy — do not use in new code
        },
        ink: "#171717",
        "ink-soft": "#525252",
        surface: "#fafaf9",
        line: "#e7e5e4",
        "line-strong": "#d6d3d1",
        turquoise: {
          DEFAULT: "#19819a",
          dark: "#166b80",
        },
        warning: {
          DEFAULT: "#ff7c2a",
          dark: "#c2410c",
        },
        success: {
          DEFAULT: "#20B86B",
          soft: "#dcfce7",
        },
        danger: {
          DEFAULT: "#FF4848",
          soft: "#fee2e2",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(180deg, #19819A 0%, #166b80 100%)",
      },
      boxShadow: {
        soft: "0 1px 0 rgba(23, 23, 23, 0.04)",
        lift: "0 2px 0 rgba(23, 23, 23, 0.06)",
        glow: "0 0 0 3px rgba(25, 129, 154, 0.18)",
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        sm: "0.125rem",
        md: "0.25rem",
        lg: "0.375rem",
        xl: "0.5rem",
        "2xl": "0.5rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};
