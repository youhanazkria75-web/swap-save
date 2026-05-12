import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export const ADMIN_TRANSACTION_TYPES = [
  'signup_bonus',
  'feature_product',
  'extra_swap_slot',
  'priority_matching',
  'coin_hold',
  'coin_release',
  'coin_credit',
  'coin_refund',
  'swap_completion_reward',
  'phone_verification_reward',
  'profile_complete_reward',
  'admin_adjustment',
  'package_purchase_pending',
  'package_purchase_completed',
  'service_fee',
] as const

export const ADMIN_TRANSACTION_DIRECTIONS = [
  'credit',
  'debit',
  'hold',
  'release',
  'refund',
  'adjustment',
] as const

export const ADMIN_TRANSACTION_STATUSES = [
  'completed',
  'pending',
  'refunded',
  'failed',
  'expired',
] as const

export type AdminTransactionType = typeof ADMIN_TRANSACTION_TYPES[number]
export type AdminTransactionDirection = typeof ADMIN_TRANSACTION_DIRECTIONS[number]
export type AdminTransactionStatus = typeof ADMIN_TRANSACTION_STATUSES[number]
export type AdminAdjustmentDirection = 'credit' | 'debit'

export interface AdminTransactionUser {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  avatar: string
  coins?: number
}

export interface AdminRelatedSwap {
  id: string
  status: string
}

export interface AdminRelatedProduct {
  id: string
  title: string
  images: string[]
}

export interface AdminTransaction {
  id: string
  user: AdminTransactionUser | null
  type: string
  direction: string
  amount: number
  currency: string
  status: string
  description: string
  metadata: Record<string, unknown>
  swap: AdminRelatedSwap | null
  product: AdminRelatedProduct | null
  createdAt: string
}

export interface AdminTransactionsFilters {
  type?: string
  direction?: string
  status?: string
  user?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface AdminTransactionsResponse {
  transactions: AdminTransaction[]
  users: AdminTransactionUser[]
  total: number
  count: number
  page: number
  limit: number
  totalPages: number
}

export interface AdminCoinAdjustmentPayload {
  userId: string
  direction: AdminAdjustmentDirection
  amount: number
  reason: string
}

export interface AdminCoinAdjustmentResponse {
  message: string
  user: AdminTransactionUser | null
  wallet: unknown
  transaction: AdminTransaction
}

export interface AdminPaymentReconcileResponse {
  message: string
  success?: boolean
  status?: string
  purpose?: string
  reason?: string
  swapId?: string
  transaction: AdminTransaction
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

const mapUser = (value: unknown): AdminTransactionUser | null => {
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
    coins: item.coins === undefined ? undefined : getNumber(item.coins),
  }
}

const mapSwap = (value: unknown): AdminRelatedSwap | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as BackendRecord

  return {
    id: String(item.id ?? item._id ?? ''),
    status: getString(item, 'status'),
  }
}

const mapProduct = (value: unknown): AdminRelatedProduct | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as BackendRecord

  return {
    id: String(item.id ?? item._id ?? ''),
    title: getString(item, 'title'),
    images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
  }
}

const mapTransaction = (value: unknown): AdminTransaction => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}
  const metadata = typeof item.metadata === 'object' && item.metadata !== null
    ? item.metadata as Record<string, unknown>
    : {}

  return {
    id: String(item.id ?? item._id ?? ''),
    user: mapUser(item.user),
    type: getString(item, 'type'),
    direction: getString(item, 'direction'),
    amount: getNumber(item.amount),
    currency: getString(item, 'currency') || 'coins',
    status: getString(item, 'status'),
    description: getString(item, 'description'),
    metadata,
    swap: mapSwap(item.swap),
    product: mapProduct(item.product),
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
  }
}

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
      'reason' in data &&
      typeof data.reason === 'string'
        ? data.reason
        : typeof data === 'object' &&
          data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : fallback
    )
  }

  return data as BackendRecord
}

const buildQueryString = (filters: AdminTransactionsFilters) => {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.set(key, String(value))
  })

  const query = params.toString()
  return query ? `?${query}` : ''
}

export const fetchAdminTransactions = async (
  filters: AdminTransactionsFilters = {}
): Promise<AdminTransactionsResponse> => {
  const response = await fetch(`${API_URL}/admin/transactions${buildQueryString(filters)}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load transactions.')
  const rawTransactions = Array.isArray(data.transactions) ? data.transactions : []
  const rawUsers = Array.isArray(data.users) ? data.users : []

  return {
    transactions: rawTransactions.map(mapTransaction),
    users: rawUsers.map(mapUser).filter((user): user is AdminTransactionUser => Boolean(user)),
    total: getNumber(data.total),
    count: getNumber(data.count),
    page: getNumber(data.page) || 1,
    limit: getNumber(data.limit) || Number(filters.limit ?? 25),
    totalPages: getNumber(data.total_pages ?? data.totalPages),
  }
}

export const searchAdminTransactionUsers = async (query: string): Promise<AdminTransactionUser[]> => {
  if (!query.trim()) {
    return []
  }

  const data = await fetchAdminTransactions({
    user: query.trim(),
    page: 1,
    limit: 1,
  })

  return data.users
}

export const adjustAdminCoins = async (
  payload: AdminCoinAdjustmentPayload
): Promise<AdminCoinAdjustmentResponse> => {
  const response = await fetch(`${API_URL}/admin/transactions/adjust`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const data = await assertOk(response, 'Failed to adjust coins.')

  return {
    message: getString(data, 'message') || 'Coin adjustment recorded',
    user: mapUser(data.user),
    wallet: data.wallet,
    transaction: mapTransaction(data.transaction),
  }
}

export const reconcileAdminPaymobTransaction = async (
  transactionId: string
): Promise<AdminPaymentReconcileResponse> => {
  const response = await fetch(`${API_URL}/payments/paymob/reconcile/${transactionId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to reconcile payment.')

  return {
    message: getString(data, 'message') || 'Payment reconciled',
    success: typeof data.success === 'boolean' ? data.success : undefined,
    status: getString(data, 'status'),
    purpose: getString(data, 'purpose'),
    reason: getString(data, 'reason'),
    swapId: getString(data, 'swapId'),
    transaction: mapTransaction(data.transaction),
  }
}
