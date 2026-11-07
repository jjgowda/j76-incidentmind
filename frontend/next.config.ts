import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();
const config: NextConfig = {
  async rewrites() {
    // Workers routes API traffic through a private service binding at runtime.
    if (process.env.CLOUDFLARE_BUILD === "1") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/:path*`,
      },
    ];
  },
};
export default config;
