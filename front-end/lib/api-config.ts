const DEFAULT_API_BASE_URL = 'http://localhost:5000'
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const isProductionRuntime = process.env.NODE_ENV === 'production'

const assertSafeProductionApiBaseUrl = (value: string | undefined): void => {
  const rawValue = value?.trim()

  if (!isProductionRuntime || !rawValue) {
    return
  }

  let url: URL

  try {
    url = new URL(rawValue)
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be an absolute http(s) URL in production.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_API_URL must be an absolute http(s) URL in production.')
  }

  if (LOCAL_API_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('NEXT_PUBLIC_API_URL must not point to localhost or 127.0.0.1 in production.')
  }
}

const normalizeApiBaseUrl = (value: string | undefined): string => {
  assertSafeProductionApiBaseUrl(value)

  const baseUrl = value?.trim() || DEFAULT_API_BASE_URL
  return baseUrl.replace(/\/+$/, '') || DEFAULT_API_BASE_URL
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL)
