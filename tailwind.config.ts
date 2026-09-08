import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B1F3A",
        blue: { DEFAULT: "#1447E6", dark: "#0B1F3A" },
        gold: "#C9A24B",
        paid: "#1E7A3D",
        part: "#B8720B",
        unpaid: "#B3261E",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
