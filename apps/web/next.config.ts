import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const config: NextConfig = {
  transpilePackages: ["@aashi/contracts"],
  // The browser talks to the API through the web app's own address, so the
  // session cookie is first-party and no cross-site rules are needed.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default config;
