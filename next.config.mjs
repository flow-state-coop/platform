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
      {
        source: "/core",
        destination: "/flow-guilds/core",
        permanent: true,
      },
      {
        source: "/admin",
        destination: "/sqf",
        permanent: true,
      },
    ];
  },
  webpack: (config) => {
    config.externals.push("pino-pretty");
    config.externals.push("encoding");

    return config;
  },
  sassOptions: {
    silenceDeprecations: [
      "import",
      "global-builtin",
      "color-functions",
      "mixed-decls",
      "legacy-js-api",
    ],
  },
};

export default nextConfig;
