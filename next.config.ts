import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Старые ссылки на APK ведут на актуальную сборку.
      { source: "/download/volna-offline-1.1.apk", destination: "/api/apk", permanent: false },
      { source: "/download/volna.apk", destination: "/api/apk", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/download/:path*",
        headers: [{ key: "Content-Type", value: "application/vnd.android.package-archive" }],
      },
    ];
  },
};

export default nextConfig;
