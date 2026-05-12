import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export interface AdminUser {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  avatar: string
  role: 'user' | 'admin' | string
  trustScore: number
  trustLevel: 'trusted' | 'new' | 'risky' | string
  rating: number
  ratingCount: number
  totalSwaps: number
  completedSwaps: number
  coins: number
  heldCoins: number
  isEmailVerified: boolean
  isPhoneVerified: boolean
  isDeleted: boolean
  accountStatus: 'active' | 'deleted' | 'pending_verification' | string
  reportCount: number
  openReportCount: number
  createdAt: string
  deletedAt: string | null
}

export interface AdminUsersFilters {
  q?: string
  role?: string
  verification?: string
  status?: string
  trust?: string
  reported?: string
  page?: number
  limit?: number
}

export interface AdminUsersSummary {
  total: number
  active: number
  deleted: number
  unverified: number
  reported: number
  lowTrust: number
}

export interface AdminUsersResponse {
  users: AdminUser[]
  count: number
  total: number
  page: number
  limit: number
  totalPages: number
  summary: AdminUsersSummary
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

const buildQueryString = (filters: AdminUsersFilters) => {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return
    params.set(key, String(value))
  })

  const query = params.toString()
  return query ? `?${query}` : ''
}

const mapUser = (value: unknown): AdminUser => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}
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
    role: getString(item, 'role') || 'user',
    trustScore: getNumber(item.trust_score ?? item.trustScore),
    trustLevel: getString(item, 'trust_level', 'trustLevel') || 'new',
    rating: getNumber(item.rating),
    ratingCount: getNumber(item.rating_count ?? item.ratingCount),
    totalSwaps: getNumber(item.total_swaps ?? item.totalSwaps),
    completedSwaps: getNumber(item.completed_swaps ?? item.completedSwaps),
    coins: getNumber(item.coins),
    heldCoins: getNumber(item.held_coins ?? item.heldCoins),
    isEmailVerified: getBoolean(item.isEmailVerified),
    isPhoneVerified: getBoolean(item.isPhoneVerified),
    isDeleted: getBoolean(item.is_deleted ?? item.isDeleted),
    accountStatus: getString(item, 'account_status', 'accountStatus') || 'active',
    reportCount: getNumber(item.report_count ?? item.reportCount),
    openReportCount: getNumber(item.open_report_count ?? item.openReportCount),
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    deletedAt: getString(item, 'deleted_at', 'deletedAt') || null,
  }
}

const mapSummary = (value: unknown): AdminUsersSummary => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}

  return {
    total: getNumber(item.total),
    active: getNumber(item.active),
    deleted: getNumber(item.deleted),
    unverified: getNumber(item.unverified),
    reported: getNumber(item.reported),
    lowTrust: getNumber(item.low_trust ?? item.lowTrust),
  }
}

export const fetchAdminUsers = async (
  filters: AdminUsersFilters = {}
): Promise<AdminUsersResponse> => {
  const response = await fetch(`${API_URL}/admin/users${buildQueryString(filters)}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load users.')
  const rawUsers = Array.isArray(data.users) ? data.users : []

  return {
    users: rawUsers.map(mapUser),
    count: getNumber(data.count),
    total: getNumber(data.total),
    page: getNumber(data.page) || 1,
    limit: getNumber(data.limit) || Number(filters.limit ?? 25),
    totalPages: getNumber(data.total_pages ?? data.totalPages),
    summary: mapSummary(data.summary),
  }
}

export const removeAdminUserFromPlatform = async (id: string, reason: string): Promise<AdminUser> => {
  const response = await fetch(`${API_URL}/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  })
  const data = await assertOk(response, 'Failed to remove user from platform.')

  return mapUser(data.user)
}
