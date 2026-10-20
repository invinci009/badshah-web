/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: false, // strict mode double-invokes effects; that would duplicate the menu<->Firestore sync in dev
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
