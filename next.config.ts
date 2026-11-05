import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/client", "@prisma/adapter-pg", "bcryptjs", "node-cron"],
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
