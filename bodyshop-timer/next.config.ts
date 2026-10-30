import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a repo that has its own lockfile; pin the root here.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
};

export default nextConfig;
