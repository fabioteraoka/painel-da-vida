import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  allowedDevOrigins: [
    "*.run.app",
    "*.google.com",
    "*.google.dev",
    "localhost:3000",
  ],
};

export default nextConfig;
