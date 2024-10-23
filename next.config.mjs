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
};

export default nextConfig;
