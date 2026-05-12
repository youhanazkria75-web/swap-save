import { API_BASE_URL as API_URL } from '@/lib/api-config'

export type AdminDashboardSwap = {
  id: string
  status: string
  requester?: { id: string; name: string; first_name?: string; last_name?: string }
  receiver?: { id: string; name: string; first_name?: string; last_name?: string }
  product_offered?: { id: string; title: string; images: string[] } | null
  product_requested?: { id: string; title: string; images: string[] } | null
  createdAt: string
  updatedAt: string
}

export type AdminDashboardReport = {
  id: string
  target_type: string
  status: string
  reason: string
  reporter?: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export type AdminDashboardSupportMessage = {
  id: string
  full_name: string
  email: string
  inquiry_type: string
  subject: string
  status: string
  createdAt: string
  updatedAt: string
}

export type AdminDashboardTransaction = {
  id: string
  type: string
  direction: string
  amount: number
  status: string
  description: string
  user?: { id: string; name: string; email?: string } | null
  createdAt: string
}

export type AdminDashboardCategoryBreakdownItem = {
  category: string
  name: string
  count: number
}

export type AdminDashboardStats = {
  total_users: number
  non_deleted_users: number
  deleted_users: number
  regular_users: number
  admin_users: number
  active_users: number | null
  active_users_available: boolean

  total_products: number
  product_statuses: Record<string, number>
  category_breakdown: AdminDashboardCategoryBreakdownItem[]
  category_counts: Record<string, number>
  available_products: number
  reserved_products: number
  swapped_products: number
  featured_products: number
  reported_products: number

  total_swaps: number
  swap_statuses: Record<string, number>
  pending_approvals: number
  completed_swaps: number
  disputed_swaps: number
  rejected_swaps: number

  total_reports: number
  report_statuses: Record<string, number>
  open_reports: number
  in_review_reports: number
  resolved_reports: number
  reports_needing_review: number

  total_contact_messages: number
  support_statuses: Record<string, number>
  open_contact_messages: number
  in_review_contact_messages: number
  support_messages_needing_review: number

  total_coin_transactions: number
  transaction_direction_totals: Record<string, number>
  total_coins_credited: number
  total_coins_debited: number
  held_coins_total: number
  admin_adjustments_count: number

  delivery_statuses: Record<string, number>

  latest_swaps: AdminDashboardSwap[]
  latest_reports: AdminDashboardReport[]
  latest_support_messages: AdminDashboardSupportMessage[]
  latest_transactions: AdminDashboardTransaction[]
}

const numberValue = (record: Record<string, unknown>, key: string, fallback = 0) => {
  const value = Number(record[key])
  return Number.isFinite(value) ? value : fallback
}

const recordValue = (record: Record<string, unknown>, key: string) => {
  const value = record[key]
  return typeof value === 'object' && value !== null ? value as Record<string, number> : {}
}

const arrayValue = <T>(record: Record<string, unknown>, key: string): T[] => {
  const value = record[key]
  return Array.isArray(value) ? value as T[] : []
}

const categoryBreakdownValue = (record: Record<string, unknown>, key: string): AdminDashboardCategoryBreakdownItem[] => {
  const value = record[key]
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item !== 'object' || item === null) return null

      const itemRecord = item as Record<string, unknown>
      const category = typeof itemRecord.category === 'string'
        ? itemRecord.category.trim()
        : typeof itemRecord.name === 'string'
          ? itemRecord.name.trim()
          : ''
      const count = Number(itemRecord.count)

      if (!category || !Number.isFinite(count)) return null

      return {
        category,
        name: typeof itemRecord.name === 'string' && itemRecord.name.trim() ? itemRecord.name.trim() : category,
        count,
      }
    })
    .filter((item): item is AdminDashboardCategoryBreakdownItem => item !== null)
}

export const emptyAdminDashboardStats: AdminDashboardStats = {
  total_users: 0,
  non_deleted_users: 0,
  deleted_users: 0,
  regular_users: 0,
  admin_users: 0,
  active_users: null,
  active_users_available: false,

  total_products: 0,
  product_statuses: {},
  category_breakdown: [],
  category_counts: {},
  available_products: 0,
  reserved_products: 0,
  swapped_products: 0,
  featured_products: 0,
  reported_products: 0,

  total_swaps: 0,
  swap_statuses: {},
  pending_approvals: 0,
  completed_swaps: 0,
  disputed_swaps: 0,
  rejected_swaps: 0,

  total_reports: 0,
  report_statuses: {},
  open_reports: 0,
  in_review_reports: 0,
  resolved_reports: 0,
  reports_needing_review: 0,

  total_contact_messages: 0,
  support_statuses: {},
  open_contact_messages: 0,
  in_review_contact_messages: 0,
  support_messages_needing_review: 0,

  total_coin_transactions: 0,
  transaction_direction_totals: {},
  total_coins_credited: 0,
  total_coins_debited: 0,
  held_coins_total: 0,
  admin_adjustments_count: 0,

  delivery_statuses: {},

  latest_swaps: [],
  latest_reports: [],
  latest_support_messages: [],
  latest_transactions: [],
}

export const mapAdminDashboardStats = (data: unknown): AdminDashboardStats => {
  if (typeof data !== 'object' || data === null) {
    return emptyAdminDashboardStats
  }

  const record = data as Record<string, unknown>

  return {
    ...emptyAdminDashboardStats,
    total_users: numberValue(record, 'total_users', numberValue(record, 'users')),
    non_deleted_users: numberValue(record, 'non_deleted_users'),
    deleted_users: numberValue(record, 'deleted_users'),
    regular_users: numberValue(record, 'regular_users'),
    admin_users: numberValue(record, 'admin_users'),
    active_users: typeof record.active_users === 'number' ? record.active_users : null,
    active_users_available: record.active_users_available === true,

    total_products: numberValue(record, 'total_products', numberValue(record, 'products')),
    product_statuses: recordValue(record, 'product_statuses'),
    category_breakdown: categoryBreakdownValue(record, 'category_breakdown'),
    category_counts: recordValue(record, 'category_counts'),
    available_products: numberValue(record, 'available_products'),
    reserved_products: numberValue(record, 'reserved_products'),
    swapped_products: numberValue(record, 'swapped_products'),
    featured_products: numberValue(record, 'featured_products'),
    reported_products: numberValue(record, 'reported_products'),

    total_swaps: numberValue(record, 'total_swaps', numberValue(record, 'swaps')),
    swap_statuses: recordValue(record, 'swap_statuses'),
    pending_approvals: numberValue(record, 'pending_approvals', numberValue(record, 'under_review_swaps')),
    completed_swaps: numberValue(record, 'completed_swaps'),
    disputed_swaps: numberValue(record, 'disputed_swaps'),
    rejected_swaps: numberValue(record, 'rejected_swaps'),

    total_reports: numberValue(record, 'total_reports', numberValue(record, 'reports')),
    report_statuses: recordValue(record, 'report_statuses'),
    open_reports: numberValue(record, 'open_reports'),
    in_review_reports: numberValue(record, 'in_review_reports'),
    resolved_reports: numberValue(record, 'resolved_reports'),
    reports_needing_review: numberValue(record, 'reports_needing_review', numberValue(record, 'open_reports') + numberValue(record, 'in_review_reports')),

    total_contact_messages: numberValue(record, 'total_contact_messages', numberValue(record, 'contact_messages')),
    support_statuses: recordValue(record, 'support_statuses'),
    open_contact_messages: numberValue(record, 'open_contact_messages'),
    in_review_contact_messages: numberValue(record, 'in_review_contact_messages'),
    support_messages_needing_review: numberValue(record, 'support_messages_needing_review', numberValue(record, 'open_contact_messages') + numberValue(record, 'in_review_contact_messages')),

    total_coin_transactions: numberValue(record, 'total_coin_transactions', numberValue(record, 'transactions')),
    transaction_direction_totals: recordValue(record, 'transaction_direction_totals'),
    total_coins_credited: numberValue(record, 'total_coins_credited'),
    total_coins_debited: numberValue(record, 'total_coins_debited'),
    held_coins_total: numberValue(record, 'held_coins_total'),
    admin_adjustments_count: numberValue(record, 'admin_adjustments_count'),

    delivery_statuses: recordValue(record, 'delivery_statuses'),

    latest_swaps: arrayValue<AdminDashboardSwap>(record, 'latest_swaps'),
    latest_reports: arrayValue<AdminDashboardReport>(record, 'latest_reports'),
    latest_support_messages: arrayValue<AdminDashboardSupportMessage>(record, 'latest_support_messages'),
    latest_transactions: arrayValue<AdminDashboardTransaction>(record, 'latest_transactions'),
  }
}

export const fetchAdminDashboardStats = async () => {
  const response = await fetch(`${API_URL}/admin/stats`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    },
  })
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : 'Failed to load admin dashboard.'

    throw new Error(message)
  }

  return mapAdminDashboardStats(data)
}
