import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Allow firebase-admin as server-only
  serverExternalPackages: ["firebase-admin"],
  // Suppress hydration warnings from dark mode
  experimental: {},
}

export default nextConfig
