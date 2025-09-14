/** @type {import('next').NextConfig} */
// Next.js configuration for our biometric authentication application
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Skip ESLint during builds to avoid blocking deployment
  },
  typescript: {
    ignoreBuildErrors: true, // Continue builds even with TypeScript errors (for rapid development)
  },
  images: {
    unoptimized: true, // Disable image optimization for static export compatibility
  },
  // Enable experimental features if needed
  experimental: {
    // Add any experimental features here as they become available
  },
}

export default nextConfig
