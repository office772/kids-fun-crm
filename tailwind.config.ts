import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        crm: {
          primary: "var(--crm-primary)",
          "primary-deep": "var(--crm-primary-deep)",
          accent: "var(--crm-accent)",
          action: "var(--crm-action)",
          bg: "var(--crm-bg)",
          surface: "var(--crm-surface)",
          "surface-soft": "var(--crm-surface-soft)",
          text: "var(--crm-text)",
          "text-muted": "var(--crm-text-muted)",
          border: "var(--crm-border)",
          success: "var(--crm-success)",
          "success-bg": "var(--crm-success-bg)",
          danger: "var(--crm-danger)",
          "danger-bg": "var(--crm-danger-bg)",
          warning: "var(--crm-warning)",
          "warning-bg": "var(--crm-warning-bg)",
        },
      },
      fontFamily: {
        rubik: ['var(--font-rubik)', 'Rubik', 'sans-serif'],
      },
      borderRadius: {
        crm: "var(--crm-radius)",
        "crm-lg": "var(--crm-radius-lg)",
      },
      boxShadow: {
        crm: "var(--crm-shadow)",
        "crm-lg": "var(--crm-shadow-lg)",
      },
    },
  },
  plugins: [],
};
export default config;
