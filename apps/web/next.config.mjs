/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@hujjah/ui'],
  devIndicators: false,
  outputFileTracingExcludes: {
    '*': ['**/*.db', '**/*.db-shm', '**/*.db-wal'],
  },
};

export default nextConfig;
