import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/flow/grid",
        destination: "/flow",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
