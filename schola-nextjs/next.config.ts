import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['mongoose', 'mongodb-memory-server'],
};

export default nextConfig;
