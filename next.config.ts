import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  // forbidden() で 403 画面を出すため
  experimental: { authInterrupts: true },
  poweredByHeader: false,
  // E2E テスト（playwright.config.ts）は別の出力先で開発サーバーを動かす（普段の開発サーバーと同時に動かせるように）
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
  // 本番用のイメージを小さくする（docker/app/Dockerfile）
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
};

export default nextConfig;
