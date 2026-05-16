/** @type {import('next').NextConfig} */
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const assertSafeProductionApiUrl = () => {
  const apiUrlValue = process.env.NEXT_PUBLIC_API_URL?.trim()
  const isVercelProduction = process.env.VERCEL_ENV === 'production'

  if (!isVercelProduction) {
    return
  }

  if (!apiUrlValue) {
    throw new Error('NEXT_PUBLIC_API_URL is required for Vercel production builds.')
  }

  let apiUrl

  try {
    apiUrl = new URL(apiUrlValue)
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be an absolute http(s) URL for Vercel production builds.')
  }

  if (apiUrl.protocol !== 'http:' && apiUrl.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL must be an absolute http(s) URL for Vercel production builds.')
  }

  if (LOCAL_API_HOSTS.has(apiUrl.hostname.toLowerCase())) {
    throw new Error('NEXT_PUBLIC_API_URL must not point to localhost or 127.0.0.1 for Vercel production builds.')
  }
}

assertSafeProductionApiUrl()

const getApiUploadRemotePattern = () => {
  if (!process.env.NEXT_PUBLIC_API_URL) {
    return []
  }

  try {
    const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL)

    return [
      {
        protocol: apiUrl.protocol.replace(':', ''),
        hostname: apiUrl.hostname,
        port: apiUrl.port,
        pathname: '/uploads/**',
      },
    ]
  } catch {
    return []
  }
}

const nextConfig = {
  images: {
    remotePatterns: [
      ...getApiUploadRemotePattern(),
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'http', hostname: 'localhost', port: '5000', pathname: '/uploads/**' },
    ],
  },
}

module.exports = nextConfig
