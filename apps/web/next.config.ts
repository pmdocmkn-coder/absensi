import type { NextConfig } from "next";

// Keep production artifacts away from Turbopack's development cache. Running
// `next build` while `next dev` is open must never invalidate browser chunks.
const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next"
};

export default nextConfig;
