import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: [
    "*.run.app",
    "localhost:3000",
  ],
};

export default nextConfig;
