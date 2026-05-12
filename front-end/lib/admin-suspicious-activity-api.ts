import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export type SuspiciousActivitySource =
  | 'user_reports'
  | 'product_reports'
  | 'excessive_disputes'
  | 'coin_adjustments'
  | 'report_spam'

export type SuspiciousActivitySeverity = 'low' | 'medium' | 'high'

export interface SuspiciousActivityUser {
  id: string
  name: string
  firstName: string
  lastName: string
  email: string
  avatar: string
  role: string
  isDeleted: boolean
}

export interface SuspiciousActivityProduct {
  id: string
  title: string
  status: string
  category: string
  owner: SuspiciousActivityUser | null
}

export interface SuspiciousActivityReport {
  id: string
  targetType: string
  targetId: string
  status: string
  reason: string
  description: string
  reporter: SuspiciousActivityUser | null
  createdAt: string
  updatedAt: string
}

export interface SuspiciousActivityActions {
  reportsUrl: string
  userUrl: string
  productUrl: string
}

export interface SuspiciousActivityItem {
  id: string
  source: SuspiciousActivitySource
  sourceLabel: string
  targetType: string
  targetId: string
  severity: SuspiciousActivitySeverity
  title: string
  description: string
  count: number
  openCount: number
  latestAt: string
  targetUser: SuspiciousActivityUser | null
  targetProduct: SuspiciousActivityProduct | null
  reports: SuspiciousActivityReport[]
  actions: SuspiciousActivityActions
}

export interface SuspiciousActivitySummary {
  total: number
  high: number
  medium: number
  low: number
  userReports: number
  productReports: number
  excessiveDisputes: number
  coinAdjustments: number
  reportSpam: number
}

export interface SuspiciousActivityFilters {
  source?: string
  severity?: string
  q?: string
}

export interface SuspiciousActivityResponse {
  activities: SuspiciousActivityItem[]
  count: number
  summary: SuspiciousActivitySummary
  detectionRules: Record<string, string>
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

const getBoolean = (value: unknown) => value === true

const getObject = (value: unknown): BackendRecord => (
  typeof value === 'object' && value !== null ? value as BackendRecord : {}
)

const getArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
)

const mapUser = (value: unknown): SuspiciousActivityUser | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as BackendRecord
  const firstName = getString(item, 'first_name', 'firstName')
  const lastName = getString(item, 'last_name', 'lastName')
  const name = getString(item, 'name') || `${firstName} ${lastName}`.trim()

  return {
    id: String(item.id ?? item._id ?? ''),
    name,
    firstName,
    lastName,
    email: getString(item, 'email'),
    avatar: getString(item, 'avatar'),
    role: getString(item, 'role') || 'user',
    isDeleted: getBoolean(item.is_deleted ?? item.isDeleted),
  }
}

const mapProduct = (value: unknown): SuspiciousActivityProduct | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as BackendRecord

  return {
    id: String(item.id ?? item._id ?? ''),
    title: getString(item, 'title'),
    status: getString(item, 'status'),
    category: getString(item, 'category'),
    owner: mapUser(item.owner),
  }
}

const mapReport = (value: unknown): SuspiciousActivityReport => {
  const item = getObject(value)

  return {
    id: String(item.id ?? item._id ?? ''),
    targetType: getString(item, 'target_type', 'targetType'),
    targetId: getString(item, 'target_id', 'targetId'),
    status: getString(item, 'status'),
    reason: getString(item, 'reason'),
    description: getString(item, 'description'),
    reporter: mapUser(item.reporter),
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    updatedAt: getString(item, 'updatedAt', 'updated_at') || new Date().toISOString(),
  }
}

const normalizeSource = (value: unknown): SuspiciousActivitySource => {
  if (
    value === 'product_reports' ||
    value === 'excessive_disputes' ||
    value === 'coin_adjustments' ||
    value === 'report_spam'
  ) {
    return value
  }

  return 'user_reports'
}

const normalizeSeverity = (value: unknown): SuspiciousActivitySeverity => {
  if (value === 'high' || value === 'medium') {
    return value
  }

  return 'low'
}

const mapActivity = (value: unknown): SuspiciousActivityItem => {
  const item = getObject(value)
  const actions = getObject(item.actions)

  return {
    id: String(item.id ?? ''),
    source: normalizeSource(item.source),
    sourceLabel: getString(item, 'source_label', 'sourceLabel'),
    targetType: getString(item, 'target_type', 'targetType'),
    targetId: getString(item, 'target_id', 'targetId'),
    severity: normalizeSeverity(item.severity),
    title: getString(item, 'title'),
    description: getString(item, 'description'),
    count: getNumber(item.count),
    openCount: getNumber(item.open_count ?? item.openCount),
    latestAt: getString(item, 'latest_at', 'latestAt') || new Date().toISOString(),
    targetUser: mapUser(item.target_user ?? item.targetUser),
    targetProduct: mapProduct(item.target_product ?? item.targetProduct),
    reports: getArray(item.reports).map(mapReport),
    actions: {
      reportsUrl: getString(actions, 'reports_url', 'reportsUrl'),
      userUrl: getString(actions, 'user_url', 'userUrl'),
      productUrl: getString(actions, 'product_url', 'productUrl'),
    },
  }
}

const mapSummary = (value: unknown): SuspiciousActivitySummary => {
  const item = getObject(value)

  return {
    total: getNumber(item.total),
    high: getNumber(item.high),
    medium: getNumber(item.medium),
    low: getNumber(item.low),
    userReports: getNumber(item.user_reports ?? item.userReports),
    productReports: getNumber(item.product_reports ?? item.productReports),
    excessiveDisputes: getNumber(item.excessive_disputes ?? item.excessiveDisputes),
    coinAdjustments: getNumber(item.coin_adjustments ?? item.coinAdjustments),
    reportSpam: getNumber(item.report_spam ?? item.reportSpam),
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

  return getObject(data)
}

const buildQueryString = (filters: SuspiciousActivityFilters) => {
  const params = new URLSearchParams()

  if (filters.source && filters.source !== 'all') params.set('source', filters.source)
  if (filters.severity && filters.severity !== 'all') params.set('severity', filters.severity)
  if (filters.q?.trim()) params.set('q', filters.q.trim())

  const query = params.toString()
  return query ? `?${query}` : ''
}

export const fetchAdminSuspiciousActivity = async (
  filters: SuspiciousActivityFilters = {}
): Promise<SuspiciousActivityResponse> => {
  const response = await fetch(`${API_URL}/admin/suspicious-activity${buildQueryString(filters)}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load suspicious activity.')
  const rawActivities = getArray(data.activities)
  const rules = getObject(data.detection_rules ?? data.detectionRules)

  return {
    activities: rawActivities.map(mapActivity),
    count: getNumber(data.count, rawActivities.length),
    summary: mapSummary(data.summary),
    detectionRules: Object.fromEntries(
      Object.entries(rules).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    ),
  }
}
