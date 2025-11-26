import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

// Export async function to enable Cloudflare bindings in development
export default async function setupConfig() {
  // Initialize Cloudflare bindings for local development
  // This enables D1, KV, R2, etc. via getPlatformProxy in npm run dev
  if (process.env.NODE_ENV === 'development') {
    await initOpenNextCloudflareForDev();
  }

  return withBundleAnalyzer(nextConfig);
}
