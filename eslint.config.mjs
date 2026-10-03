import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // E2E テスト用の開発サーバーの出力先（playwright.config.ts）
    ".next-*/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    // GitHub Pages の操作デモ（CDN の Preact で書いた静的ページ）。Next.js / React Compiler 向けのルールは当てはまらない
    "demo/**",
  ]),
]);

export default eslintConfig;
