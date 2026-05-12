const DEFAULT_API_BASE_URL = 'http://localhost:5000'

const normalizeApiBaseUrl = (value: string | undefined): string => {
  const baseUrl = value?.trim() || DEFAULT_API_BASE_URL
  return baseUrl.replace(/\/+$/, '') || DEFAULT_API_BASE_URL
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL)
