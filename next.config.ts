import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // output: "standalone",
};

export default withWorkflow(nextConfig);
