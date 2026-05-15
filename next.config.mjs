const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0' },
  { key: 'CDN-Cache-Control', value: 'no-store' },
  { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
]

const publicAssetCacheHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
]

const cacheablePublicAssets = [
  '/gerencia-educacao-logo-light.svg',
  '/gerencia-educacao-logo-dark.svg',
  '/gerencia-educacao-mark.svg',
  '/icon.svg',
  '/placeholder.svg',
  '/placeholder-logo.svg',
  '/placeholder-logo.png',
  '/placeholder.jpg',
  '/placeholder-user.jpg',
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    optimizePackageImports: [
      'recharts',
      'date-fns',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/api/:path*',
        headers: noStoreHeaders,
      },
      ...cacheablePublicAssets.map((source) => ({
        source,
        headers: publicAssetCacheHeaders,
      })),
      {
        source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
        headers: noStoreHeaders,
      },
    ]
  },
}

export default nextConfig
