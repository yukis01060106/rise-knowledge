import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // forbidden() で 403 画面を出すため
  experimental: { authInterrupts: true },
  poweredByHeader: false,
};

export default nextConfig;
