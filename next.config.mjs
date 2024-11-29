/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/octant",
        destination: "/pool/?chainId=8453&poolId=63",
        permanent: true,
      },
    ];
  },
  webpack: (config) => {
    config.externals.push("pino-pretty");
    config.externals.push("encoding");

    return config;
  },
};

export default nextConfig;
