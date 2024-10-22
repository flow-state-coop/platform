/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/octant",
        destination: "/pool",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
