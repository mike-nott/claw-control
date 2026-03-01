import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      typography: {
        invert: {
          css: {
            "--tw-prose-body": "var(--mc-text-body)",
            "--tw-prose-headings": "var(--mc-text-primary)",
            "--tw-prose-bold": "var(--mc-text-primary)",
            "--tw-prose-links": "var(--mc-blue-light)",
            "--tw-prose-code": "var(--mc-text-primary)",
            "--tw-prose-pre-code": "var(--mc-text-body)",
            "--tw-prose-pre-bg": "var(--mc-surface-0)",
            "--tw-prose-th-borders": "var(--mc-border-strong)",
            "--tw-prose-td-borders": "var(--mc-border-strong)",
            "--tw-prose-bullets": "var(--mc-text-faint)",
            "--tw-prose-counters": "var(--mc-text-faint)",
            "--tw-prose-quotes": "var(--mc-text-muted)",
            "--tw-prose-quote-borders": "var(--mc-border-strong)",
            "--tw-prose-hr": "var(--mc-border-strong)",
            "--tw-prose-captions": "var(--mc-text-muted)",
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
