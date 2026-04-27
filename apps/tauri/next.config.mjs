/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
  devIndicators: false,
  transpilePackages: ['@hujjah/ui'],
};

export default nextConfig;
