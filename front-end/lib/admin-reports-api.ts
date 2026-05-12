import type { ReportStatus, ReportTarget } from '@/types'

import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export type AdminReportResolutionAction = 'dismiss' | 'resolve' | 'cancel_swap' | 'continue_swap'

export interface AdminReportUser {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  avatar: string
  role: string
  isDeleted: boolean
}

export interface AdminReportTarget {
  type: ReportTarget
  id: string
  label: string
  url: string
  product?: { id: string; title: string; status?: string } | null
  user?: AdminReportUser | null
  message?: {
    id: string
    content: string
    is_reported?: boolean
    report_reason?: string
    sender?: AdminReportUser | null
  } | null
}

export interface AdminReport {
  id: string
  reporter: AdminReportUser | null
  targetType: ReportTarget
  targetId: string
  target: AdminReportTarget
  swapId: string
  reason: string
  description: string
  status: ReportStatus
  previousSwapStatus?: string
  currentSwapStatus?: string
  resolutionAction?: AdminReportResolutionAction
  adminNotes?: string
  resolvedBy: AdminReportUser | null
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AdminReportsFilters {
  status?: string
  targetType?: string
  reason?: string
  q?: string
  page?: number
  limit?: number
}

export interface AdminReportsResponse {
  reports: AdminReport[]
  count: number
  total: number
  page: number
  limit: number
  totalPages: number
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

const getNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const getId = (value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    const record = value as BackendRecord
    return String(record._id ?? record.id ?? '')
  }

  return String(value ?? '')
}

const normalizeReportStatus = (status: unknown): ReportStatus => {
  if (status === 'under_review' || status === 'under-review') return 'under_review'
  if (status === 'resolved' || status === 'dismissed' || status === 'open') return status
  return 'open'
}

const normalizeTargetType = (targetType: unknown): ReportTarget => {
  if (targetType === 'message' || targetType === 'product' || targetType === 'user' || targetType === 'swap') {
    return targetType
  }

  return 'swap'
}

const mapUser = (value: unknown): AdminReportUser | null => {
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
    role: getString(item, 'role') || 'user',
    isDeleted: item.is_deleted === true || item.isDeleted === true,
  }
}

const mapTarget = (value: unknown, fallbackType: ReportTarget, fallbackId: string): AdminReportTarget => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}
  const type = normalizeTargetType(item.type || fallbackType)
  const productRaw = typeof item.product === 'object' && item.product !== null ? item.product as BackendRecord : null
  const messageRaw = typeof item.message === 'object' && item.message !== null ? item.message as BackendRecord : null

  return {
    type,
    id: getString(item, 'id') || fallbackId,
    label: getString(item, 'label') || fallbackId,
    url: getString(item, 'url'),
    product: productRaw
      ? {
          id: getId(productRaw),
          title: getString(productRaw, 'title'),
          status: getString(productRaw, 'status'),
        }
      : null,
    user: mapUser(item.user),
    message: messageRaw
      ? {
          id: getId(messageRaw),
          content: getString(messageRaw, 'content'),
          is_reported: messageRaw.is_reported === true,
          report_reason: getString(messageRaw, 'report_reason', 'reportReason'),
          sender: mapUser(messageRaw.sender),
        }
      : null,
  }
}

const mapReport = (value: unknown): AdminReport => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}
  const targetType = normalizeTargetType(item.target_type ?? item.targetType)
  const targetId = getId(item.target_id ?? item.targetId)
  const swapId = getString(item, 'related_swap_id', 'relatedSwapId') || getId(item.swap)

  return {
    id: String(item.id ?? item._id ?? ''),
    reporter: mapUser(item.reporter),
    targetType,
    targetId,
    target: mapTarget(item.target, targetType, targetId),
    swapId,
    reason: getString(item, 'reason'),
    description: getString(item, 'description'),
    status: normalizeReportStatus(item.status),
    previousSwapStatus: getString(item, 'previous_swap_status', 'previousSwapStatus') || undefined,
    currentSwapStatus: getString(item, 'current_swap_status', 'currentSwapStatus') || undefined,
    resolutionAction: getString(item, 'resolution_action', 'resolutionAction') as AdminReportResolutionAction || undefined,
    adminNotes: getString(item, 'admin_notes', 'adminNotes') || undefined,
    resolvedBy: mapUser(item.resolved_by ?? item.resolvedBy),
    resolvedAt: getString(item, 'resolved_at', 'resolvedAt') || undefined,
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    updatedAt: getString(item, 'updatedAt', 'updated_at') || new Date().toISOString(),
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
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : fallback
    )
  }

  return (typeof data === 'object' && data !== null ? data : {}) as BackendRecord
}

const buildQueryString = (filters: AdminReportsFilters) => {
  const params = new URLSearchParams()

  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.targetType && filters.targetType !== 'all') params.set('target_type', filters.targetType)
  if (filters.reason?.trim()) params.set('reason', filters.reason.trim())
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))

  const query = params.toString()
  return query ? `?${query}` : ''
}

export const fetchAdminReports = async (
  filters: AdminReportsFilters = {}
): Promise<AdminReportsResponse> => {
  const response = await fetch(`${API_URL}/admin/reports${buildQueryString(filters)}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load reports.')
  const rawReports = Array.isArray(data.reports) ? data.reports : []

  return {
    reports: rawReports.map(mapReport),
    count: getNumber(data.count),
    total: getNumber(data.total, rawReports.length),
    page: getNumber(data.page, filters.page || 1),
    limit: getNumber(data.limit, filters.limit || 50),
    totalPages: getNumber(data.total_pages ?? data.totalPages, 1),
  }
}

export const resolveAdminReport = async (
  id: string,
  resolutionAction: AdminReportResolutionAction,
  adminNotes: string
): Promise<AdminReport> => {
  const response = await fetch(`${API_URL}/admin/reports/${id}/resolve`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resolution_action: resolutionAction,
      admin_notes: adminNotes,
    }),
  })
  const data = await assertOk(response, 'Failed to update report.')

  return mapReport(data.report)
}
