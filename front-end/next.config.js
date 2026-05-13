/** @type {import('next').NextConfig} */
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
