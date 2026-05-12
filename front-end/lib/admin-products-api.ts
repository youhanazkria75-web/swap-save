import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export interface AdminProductOwner {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  avatar: string
  isDeleted: boolean
}

export interface AdminProduct {
  id: string
  title: string
  images: string[]
  owner: AdminProductOwner | null
  category: string
  condition: string
  estimatedValue: number
  status: string
  viewCount: number
  savedCount: number
  isFeatured: boolean
  featuredUntil: string | null
  reportCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminProductsFilters {
  q?: string
  status?: string
  category?: string
  featured?: string
  reported?: string
  page?: number
  limit?: number
}

export interface AdminProductsSummary {
  total: number
  featured: number
  reported: number
  inactive: number
  rejected: number
}

export interface AdminProductsResponse {
  products: AdminProduct[]
  categories: string[]
  count: number
  total: number
  page: number
  limit: number
  totalPages: number
  summary: AdminProductsSummary
}

export interface AdminProductUpdate {
  status?: 'available' | 'inactive' | 'rejected'
  is_featured?: boolean
}

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
})

const getString = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }

  return ''
}

const getNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getBoolean = (value: unknown) => value === true

const parseJson = async (response: Response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const assertOk = async (response: Response, fallback: string) => {
  const data = await parseJson(response)

  if (!response.ok) {
    throw new Error(
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : fallback
    )
  }

  return (typeof data === 'object' && data !== null ? data : {}) as BackendRecord
}

const buildQueryString = (filters: AdminProductsFilters) => {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return
    params.set(key, String(value))
  })

  const query = params.toString()
  return query ? `?${query}` : ''
}

const mapOwner = (value: unknown): AdminProductOwner | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as BackendRecord
  const firstName = getString(item, 'first_name', 'firstName')
  const lastName = getString(item, 'last_name', 'lastName')
  const name = getString(item, 'name') || `${firstName} ${lastName}`.trim()

  return {
    id: String(item.id ?? item._id ?? ''),
    firstName,
    lastName,
    name,
    email: getString(item, 'email'),
    avatar: getString(item, 'avatar'),
    isDeleted: getBoolean(item.is_deleted ?? item.isDeleted),
  }
}

const mapProduct = (value: unknown): AdminProduct => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}

  return {
    id: String(item.id ?? item._id ?? ''),
    title: getString(item, 'title'),
    images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
    owner: mapOwner(item.owner),
    category: getString(item, 'category'),
    condition: getString(item, 'condition'),
    estimatedValue: getNumber(item.estimated_value ?? item.estimatedValue),
    status: getString(item, 'status') || 'available',
    viewCount: getNumber(item.view_count ?? item.viewCount),
    savedCount: getNumber(item.saved_count ?? item.savedCount),
    isFeatured: getBoolean(item.is_featured ?? item.isFeatured),
    featuredUntil: getString(item, 'featured_until', 'featuredUntil') || null,
    reportCount: getNumber(item.report_count ?? item.reportCount),
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    updatedAt: getString(item, 'updatedAt', 'updated_at') || new Date().toISOString(),
  }
}

const mapSummary = (value: unknown): AdminProductsSummary => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}

  return {
    total: getNumber(item.total),
    featured: getNumber(item.featured),
    reported: getNumber(item.reported),
    inactive: getNumber(item.inactive),
    rejected: getNumber(item.rejected),
  }
}

export const fetchAdminProducts = async (
  filters: AdminProductsFilters = {}
): Promise<AdminProductsResponse> => {
  const response = await fetch(`${API_URL}/admin/products${buildQueryString(filters)}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load products.')
  const rawProducts = Array.isArray(data.products) ? data.products : []

  return {
    products: rawProducts.map(mapProduct),
    categories: Array.isArray(data.categories)
      ? data.categories.filter((category): category is string => typeof category === 'string')
      : [],
    count: getNumber(data.count),
    total: getNumber(data.total),
    page: getNumber(data.page) || 1,
    limit: getNumber(data.limit) || Number(filters.limit ?? 25),
    totalPages: getNumber(data.total_pages ?? data.totalPages),
    summary: mapSummary(data.summary),
  }
}

export const updateAdminProduct = async (
  id: string,
  updates: AdminProductUpdate
): Promise<AdminProduct> => {
  const response = await fetch(`${API_URL}/admin/products/${id}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  const data = await assertOk(response, 'Failed to update product.')

  return mapProduct(data.product)
}
