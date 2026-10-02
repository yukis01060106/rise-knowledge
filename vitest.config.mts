import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" は Next.js 以外で import するとエラーになるため、テストでは空にする
      "server-only": path.resolve(__dirname, "tests/helpers/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // 統合テストは 1 つのテスト用 DB を共有するので、ファイルを並列に実行しない
    fileParallelism: false,
  },
});
