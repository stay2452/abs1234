import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  // instrumentationHook em Next 16 é auto-detectado via src/instrumentation.ts
};

export default nextConfig;
