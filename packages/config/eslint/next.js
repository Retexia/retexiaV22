import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import base from "./base.js";

/** Lint rules for Next.js apps (apps/web and future product apps). */
export default [
  ...base,
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      // App Router only: there is no pages/ directory.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  { ignores: ["next-env.d.ts"] },
];
