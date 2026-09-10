import type { NextConfig } from "next";
import { assertDeploymentConfig } from "./src/lib/deployment-config.ts";

// Deployment-time configuration gate. Next.js evaluates this file on every
// build, and on Vercel a failed build never goes live - the previous
// deployment keeps serving. That makes this, not the startup hook, the place
// where an incomplete staging/production configuration is refused (see
// src/lib/deployment-config.ts for why startup cannot do it on Vercel).
// Local and CI builds are not hosted deployments and are not affected.
assertDeploymentConfig(process.env);

// GOV-001 baseline. Vendor-specific hosting behaviour stays out of this file
// until OD-03 is decided (GATE_4_READINESS_REGISTER.md §3).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
