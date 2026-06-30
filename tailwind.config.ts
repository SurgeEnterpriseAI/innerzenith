import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-cormorant)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          50: "#faf8f5",
          100: "#f4efe7",
          200: "#e8ddc9",
          300: "#cdbfa3",
          400: "#a8987a",
          500: "#7a6b51",
          600: "#5a4d37",
          700: "#3d3424",
          800: "#241f15",
          900: "#15110a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
