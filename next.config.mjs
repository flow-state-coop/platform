/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/octant",
        destination: "/flow-qf/?chainId=8453&poolId=63",
        permanent: true,
      },
      {
        source: "/core",
        destination: "/flow-guilds/core",
        permanent: true,
      },
      {
        source: "/goodbuilders-3/app",
        destination: "/flow-councils/application/42220/0xfabef1abae4998146e8a8422813eb787caa26ec2",
        permanent: true,
      },
      {
        source: "/goodbuilders-3/admin",
        destination: "/flow-councils/review/42220/0xfabef1abae4998146e8a8422813eb787caa26ec2",
        permanent: true,
      },
      {
        source: "/goodbuilders-3",
        destination: "/flow-councils/42220/0xfabef1abae4998146e8a8422813eb787caa26ec2",
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
