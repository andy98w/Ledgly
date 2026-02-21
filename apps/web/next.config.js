/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@ledgly/shared'],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
