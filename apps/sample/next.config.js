/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['bridge-emulator'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
