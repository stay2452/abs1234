import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  // Navegacao entre abas reusa o cache do router por 60s em vez de refazer
  // as queries (o refresh() apos coleta/import continua buscando dado fresco).
  staleTimes: {
    dynamic: 60,
    static: 300,
  },
  // instrumentationHook em Next 16 é auto-detectado via src/instrumentation.ts
};

export default nextConfig;
