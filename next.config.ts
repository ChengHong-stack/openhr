import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep DB packages as real node_modules so scripts/migrate.mjs and prisma/seed.mjs can use them in the image.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  // The WASM query compiler is loaded at runtime via fs, so tracing misses it.
  outputFileTracingIncludes: { "/**": ["./node_modules/.prisma/client/**/*"] },
  experimental: { serverActions: { bodySizeLimit: "20mb" /* medical leave can carry an MC and a receipt */ } },
};

export default nextConfig;
