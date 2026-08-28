import type { NextConfig } from "next";

// GOV-001 baseline. Vendor-specific hosting behaviour stays out of this file
// until OD-03 is decided (GATE_4_READINESS_REGISTER.md §3).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
