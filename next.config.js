/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: false, // strict mode double-invokes effects; that would duplicate the menu<->Firestore sync in dev
  webpack: (config, { dev, isServer }) => {
    if (dev && isServer) {
      // In dev mode on the server, disable vendor chunk splitting to prevent
      // "Cannot find module './chunks/vendor-chunks/next.js'" on Windows/Next 13.5
      if (config.optimization?.splitChunks?.cacheGroups?.vendor) {
        delete config.optimization.splitChunks.cacheGroups.vendor
      }
    }
    return config
  },
  async headers() {
    // Long-lived caching for static food images (they are content-addressed by filename)
    const foodImageCache = { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }
    return [
      { source: '/menu/:path*', headers: [foodImageCache] },
      { source: '/generated_menu/:path*', headers: [foodImageCache] },
      { source: '/newmenu/:path*', headers: [foodImageCache] },
      { source: '/images/:path*', headers: [foodImageCache] },
    ]
  },
}

module.exports = nextConfig
