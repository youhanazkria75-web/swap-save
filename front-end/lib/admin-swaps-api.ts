import type {
  DeliveryDetails,
  DeliveryLifecycleStatus,
  ExchangeMethod,
  ExchangeProposalStatus,
  MeetupDetails,
  Message,
  Product,
  ProductCondition,
  ProductStatus,
  SwapRequest,
  SwapStatus,
  SwapTimelineEvent,
  TrustLevel,
  User,
} from '@/types'

import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export interface AdminSwapPayload {
  swaps: SwapRequest[]
  users: Record<string, User>
  products: Record<string, Product>
  count: number
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface AdminSwapDetailPayload {
  swap: SwapRequest
  users: Record<string, User>
  products: Record<string, Product>
  reports: AdminSwapReport[]
}

export interface AdminSwapCancelPayload extends AdminSwapDetailPayload {
  serviceFeeReviewRequired: boolean
  completedServiceFeeTransactions: number
  expiredServiceFeeTransactions: number
}

export interface AdminSwapFilters {
  status?: SwapStatus | 'all'
  exchangeMethod?: ExchangeMethod | 'all'
  q?: string
  page?: number
  limit?: number
}

export interface AdminSwapReport {
  id: string
  targetType: string
  targetId: string
  reason: string
  description: string
  status: string
  adminNotes: string
  reporter?: User
  createdAt: string
  updatedAt: string
}

const getAuthHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
})

const getId = (value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    const record = value as BackendRecord
    return String(record._id ?? record.id ?? '')
  }

  return String(value ?? '')
}

const getString = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }

  return ''
}

const normalizeSwapStatus = (status: unknown): SwapStatus => {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'accepted':
      return 'in_discussion'
    case 'in_discussion':
    case 'in-discussion':
      return 'in_discussion'
    case 'under_review':
    case 'under-review':
      return 'under_review'
    case 'approved':
      return 'approved'
    case 'payment_pending':
    case 'payment-pending':
      return 'payment_pending'
    case 'exchange_setup':
    case 'exchange-setup':
      return 'exchange_setup'
    case 'in_progress':
    case 'in-progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'rejected':
      return 'rejected'
    case 'cancelled':
      return 'cancelled'
    case 'disputed':
      return 'disputed'
    default:
      return 'pending'
  }
}

const normalizeProductStatus = (status: unknown): ProductStatus => {
  switch (status) {
    case 'available':
    case 'active':
      return 'active'
    case 'reserved':
      return 'reserved'
    case 'pending':
    case 'under_review':
    case 'under-review':
      return 'pending'
    case 'swapped':
    case 'completed':
      return 'swapped'
    case 'inactive':
    case 'archived':
      return 'inactive'
    case 'rejected':
      return 'rejected'
    default:
      return 'inactive'
  }
}

const normalizeProductCondition = (condition: unknown): ProductCondition => {
  if (typeof condition !== 'string') return 'good'

  const normalized = condition.trim().toLowerCase().replace(/[_\s]+/g, '-')

  switch (normalized) {
    case 'new':
      return 'new'
    case 'like-new':
      return 'like-new'
    case 'good':
      return 'good'
    case 'fair':
      return 'fair'
    case 'poor':
      return 'poor'
    default:
      return 'good'
  }
}

const normalizeExchangeMethod = (method: unknown): ExchangeMethod | undefined =>
  method === 'meetup' || method === 'delivery' ? method : undefined

const normalizeExchangeProposalStatus = (status: unknown): ExchangeProposalStatus => {
  if (status === 'pending' || status === 'accepted' || status === 'changes_requested') {
    return status
  }

  return 'none'
}

const normalizeDeliveryStatus = (status: unknown): DeliveryLifecycleStatus => {
  if (
    status === 'pending_pickup' ||
    status === 'picked_up' ||
    status === 'in_transit' ||
    status === 'delivered_to_receiver' ||
    status === 'delivery_completed'
  ) {
    return status
  }

  return 'pending_pickup'
}

const mapMeetupDetails = (details: unknown): MeetupDetails | undefined => {
  if (typeof details !== 'object' || details === null) return undefined

  const item = details as BackendRecord
  const city = getString(item, 'city')
  const area = getString(item, 'area')
  const meetingPoint = getString(item, 'meeting_point', 'meetingPoint')
  const date = getString(item, 'date')
  const time = getString(item, 'time')

  if (!city && !area && !meetingPoint && !date && !time) return undefined

  return {
    city,
    area,
    meetingPoint,
    date,
    time,
    additionalNotes: getString(item, 'additional_notes', 'additionalNotes') || undefined,
  }
}

const mapDeliveryDetails = (details: unknown): DeliveryDetails | undefined => {
  if (typeof details !== 'object' || details === null) return undefined

  const item = details as BackendRecord
  const requesterPickupRaw =
    typeof item.requester_pickup === 'object' && item.requester_pickup !== null
      ? item.requester_pickup as BackendRecord
      : typeof item.requesterPickup === 'object' && item.requesterPickup !== null
        ? item.requesterPickup as BackendRecord
        : {}
  const receiverPickupRaw =
    typeof item.receiver_pickup === 'object' && item.receiver_pickup !== null
      ? item.receiver_pickup as BackendRecord
      : typeof item.receiverPickup === 'object' && item.receiverPickup !== null
        ? item.receiverPickup as BackendRecord
        : {}
  const trackingRaw =
    typeof item.tracking === 'object' && item.tracking !== null ? item.tracking as BackendRecord : {}

  const mapPickup = (pickup: BackendRecord) => ({
    address: getString(pickup, 'address'),
    country: getString(pickup, 'country'),
    city: getString(pickup, 'city'),
    area: getString(pickup, 'area'),
    preferredDate: getString(pickup, 'preferred_date', 'preferredDate'),
    preferredTime: getString(pickup, 'preferred_time', 'preferredTime'),
    notes: getString(pickup, 'notes') || undefined,
    submitted: Boolean(pickup.submitted),
  })

  const requesterPickup = mapPickup(requesterPickupRaw)
  const receiverPickup = mapPickup(receiverPickupRaw)
  const tracking = {
    requesterItemPickedUp: Boolean(trackingRaw.requester_item_picked_up ?? trackingRaw.requesterItemPickedUp),
    receiverItemPickedUp: Boolean(trackingRaw.receiver_item_picked_up ?? trackingRaw.receiverItemPickedUp),
    deliveredToRequester: Boolean(trackingRaw.delivered_to_requester ?? trackingRaw.deliveredToRequester),
    deliveredToReceiver: Boolean(trackingRaw.delivered_to_receiver ?? trackingRaw.deliveredToReceiver),
  }

  return {
    requesterPickup,
    receiverPickup,
    feePerUser: Number(item.fee_per_user ?? item.feePerUser ?? 100),
    paymentMethod: 'cash_to_courier',
    deliveryStatus: normalizeDeliveryStatus(item.delivery_status ?? item.deliveryStatus),
    tracking,
  }
}

const mapUser = (item: BackendRecord): User => ({
  id: String(item._id ?? item.id ?? ''),
  firstName: getString(item, 'first_name', 'firstName'),
  lastName: getString(item, 'last_name', 'lastName'),
  email: getString(item, 'email'),
  phone: typeof item.phone === 'string' ? item.phone : undefined,
  avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
  country: getString(item, 'country'),
  city: getString(item, 'city'),
  streetAddress: getString(item, 'streetAddress', 'street_address') || undefined,
  bio: typeof item.bio === 'string' ? item.bio : undefined,
  joinedAt: getString(item, 'joinedAt', 'joined_at', 'createdAt') || new Date().toISOString(),
  isEmailVerified: Boolean(item.isEmailVerified ?? item.is_email_verified),
  isPhoneVerified: Boolean(item.isPhoneVerified ?? item.is_phone_verified),
  isAdmin: item.role === 'admin' || Boolean(item.isAdmin ?? item.is_admin),
  trustLevel: (typeof item.trustLevel === 'string' ? item.trustLevel : 'new') as TrustLevel,
  trustScore: Number(item.trustScore ?? 20),
  completedSwaps: Number(item.completedSwaps ?? item.completed_swaps ?? 0),
  totalSwaps: Number(item.totalSwaps ?? item.total_swaps ?? 0),
  rating: Number(item.rating ?? 0),
  ratingCount: Number(item.ratingCount ?? item.rating_count ?? 0),
  coinBalance: Number(item.coinBalance ?? item.coin_balance ?? 0),
  featuredSlotsUsed: Number(item.featuredSlotsUsed ?? item.featured_slots_used ?? 0),
  profileCompleteness: Number(item.profileCompleteness ?? item.profile_completeness ?? 0),
  isSuspended: Boolean(item.isSuspended ?? item.is_suspended),
  lastActiveAt: getString(item, 'lastActiveAt', 'last_active_at', 'updatedAt') || new Date().toISOString(),
})

const mapProduct = (item: BackendRecord): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId: getId(item.owner_id ?? item.ownerId),
  title: getString(item, 'title'),
  description: getString(item, 'description'),
  category: getString(item, 'category'),
  subcategory: getString(item, 'subcategory') || undefined,
  condition: normalizeProductCondition(item.condition),
  estimatedValue: Number(item.estimated_value ?? item.estimatedValue ?? 0),
  location: getString(item, 'location'),
  images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  status: normalizeProductStatus(item.status),
  isFeatured: Boolean(item.is_featured ?? item.isFeatured),
  featuredUntil: getString(item, 'featured_until', 'featuredUntil') || undefined,
  viewCount: Number(item.view_count ?? item.viewCount ?? 0),
  savedCount: Number(item.saved_count ?? item.savedCount ?? 0),
  createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
  updatedAt: getString(item, 'updatedAt', 'updated_at') || new Date().toISOString(),
})

const normalizeTimelineActor = (actor: unknown): SwapTimelineEvent['actor'] => {
  if (actor === 'requester' || actor === 'receiver' || actor === 'admin' || actor === 'system') {
    return actor
  }

  return 'system'
}

const mapTimelineEvent = (item: BackendRecord, swapId: string): SwapTimelineEvent => ({
  id: String(item._id ?? item.id ?? ''),
  swapId: getId(item.swap ?? item.swapId) || swapId,
  event: getString(item, 'event'),
  description: getString(item, 'description'),
  actor: normalizeTimelineActor(item.actor),
  actorId: getId(item.actor_id ?? item.actorId) || undefined,
  createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
})

const mapSwap = (item: BackendRecord): SwapRequest => {
  const id = String(item._id ?? item.id ?? '')
  const status = normalizeSwapStatus(item.status)
  const timeline = Array.isArray(item.timeline)
    ? item.timeline.map(event => mapTimelineEvent(event as BackendRecord, id))
    : []

  return {
    id,
    requesterId: getId(item.requester ?? item.requesterId),
    receiverId: getId(item.receiver ?? item.receiverId),
    offeredProductId: getId(item.product_offered ?? item.offeredProductId),
    requestedProductId: getId(item.product_requested ?? item.requestedProductId),
    status,
    message: getString(item, 'message'),
    adminNotes: getString(item, 'admin_notes', 'adminNotes') || undefined,
    adminReviewedBy: getId(item.admin_reviewed_by ?? item.adminReviewedBy) || undefined,
    adminReviewedAt: getString(item, 'admin_reviewed_at', 'adminReviewedAt') || undefined,
    serviceFeeRequester: Number(item.serviceFeeRequester ?? item.service_fee_requester ?? 0),
    serviceFeeReceiver: Number(item.serviceFeeReceiver ?? item.service_fee_receiver ?? 0),
    requesterPaid: Boolean(item.requesterPaid ?? item.requester_paid),
    receiverPaid: Boolean(item.receiverPaid ?? item.receiver_paid),
    exchangeMethod: normalizeExchangeMethod(item.exchange_method ?? item.exchangeMethod),
    meetupDetails: mapMeetupDetails(item.meetup_details ?? item.meetupDetails),
    deliveryDetails: mapDeliveryDetails(item.delivery_details ?? item.deliveryDetails),
    exchangeProposedBy: getId(item.exchange_proposed_by ?? item.exchangeProposedBy) || undefined,
    exchangeAcceptedBy: getId(item.exchange_accepted_by ?? item.exchangeAcceptedBy) || undefined,
    exchangeProposalStatus: normalizeExchangeProposalStatus(item.exchange_proposal_status ?? item.exchangeProposalStatus),
    compensationAmount: Number(item.compensation_amount ?? item.compensationAmount ?? 0),
    compensationPayer: getId(item.compensation_payer ?? item.compensationPayer) || undefined,
    compensationReceiver: getId(item.compensation_receiver ?? item.compensationReceiver) || undefined,
    compensationStatus: typeof item.compensation_status === 'string' ? item.compensation_status as SwapRequest['compensationStatus'] : 'none',
    compensationProposedBy: getId(item.compensation_proposed_by ?? item.compensationProposedBy) || undefined,
    compensationAcceptedBy: getId(item.compensation_accepted_by ?? item.compensationAcceptedBy) || undefined,
    compensationProposedAt: getString(item, 'compensation_proposed_at', 'compensationProposedAt') || undefined,
    compensationAcceptedAt: getString(item, 'compensation_accepted_at', 'compensationAcceptedAt') || undefined,
    compensationRejectedAt: getString(item, 'compensation_rejected_at', 'compensationRejectedAt') || undefined,
    reportCount: Number(item.report_count ?? item.reportCount ?? 0),
    openReportCount: Number(item.open_report_count ?? item.openReportCount ?? 0),
    requesterConfirmed: Boolean(item.requesterConfirmed ?? item.requester_confirmed),
    receiverConfirmed: Boolean(item.receiverConfirmed ?? item.receiver_confirmed),
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    updatedAt: getString(item, 'updatedAt', 'updated_at') || new Date().toISOString(),
    timeline,
  }
}

const collectRecords = (items: BackendRecord[]) => {
  const users: Record<string, User> = {}
  const products: Record<string, Product> = {}

  items.forEach((item) => {
    ;['requester', 'receiver', 'admin_reviewed_by'].forEach((key) => {
      const value = item[key]
      if (typeof value === 'object' && value !== null) {
        const user = mapUser(value as BackendRecord)
        if (user.id) users[user.id] = user
      }
    })

    ;['product_offered', 'product_requested'].forEach((key) => {
      const value = item[key]
      if (typeof value === 'object' && value !== null) {
        const product = mapProduct(value as BackendRecord)
        if (product.id) products[product.id] = product
      }
    })
  })

  return { users, products }
}

const mapReport = (item: BackendRecord): AdminSwapReport => {
  const reporterRaw = typeof item.reporter === 'object' && item.reporter !== null ? item.reporter as BackendRecord : null

  return {
    id: String(item._id ?? item.id ?? ''),
    targetType: getString(item, 'target_type', 'targetType'),
    targetId: getId(item.target_id ?? item.targetId),
    reason: getString(item, 'reason'),
    description: getString(item, 'description'),
    status: getString(item, 'status'),
    adminNotes: getString(item, 'admin_notes', 'adminNotes'),
    reporter: reporterRaw ? mapUser(reporterRaw) : undefined,
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

  return data as BackendRecord
}

const buildSwapQueryString = (filters: AdminSwapFilters) => {
  const params = new URLSearchParams()

  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.exchangeMethod && filters.exchangeMethod !== 'all') params.set('exchange_method', filters.exchangeMethod)
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))

  const query = params.toString()
  return query ? `?${query}` : ''
}

const getNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const fetchAdminSwaps = async (filters?: SwapStatus | AdminSwapFilters): Promise<AdminSwapPayload> => {
  const normalizedFilters: AdminSwapFilters = typeof filters === 'string' ? { status: filters } : filters || {}
  const query = buildSwapQueryString(normalizedFilters)
  const response = await fetch(`${API_URL}/admin/swaps${query}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load admin swaps.')
  const rawSwaps = Array.isArray(data.swaps) ? data.swaps as BackendRecord[] : []
  const { users, products } = collectRecords(rawSwaps)

  return {
    swaps: rawSwaps.map(mapSwap),
    users,
    products,
    count: getNumber(data.count),
    total: getNumber(data.total, rawSwaps.length),
    page: getNumber(data.page, normalizedFilters.page || 1),
    limit: getNumber(data.limit, normalizedFilters.limit || rawSwaps.length || 50),
    totalPages: getNumber(data.total_pages ?? data.totalPages, 1),
  }
}

export const fetchAdminSwap = async (id: string): Promise<AdminSwapDetailPayload> => {
  const response = await fetch(`${API_URL}/admin/swaps/${id}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load admin swap.')
  const rawSwap = typeof data.swap === 'object' && data.swap !== null ? data.swap as BackendRecord : {}
  const { users, products } = collectRecords([rawSwap])

  return {
    swap: mapSwap(rawSwap),
    users,
    products,
    reports: Array.isArray(data.reports) ? (data.reports as BackendRecord[]).map(mapReport) : [],
  }
}

export const fetchAdminSwapMessages = async (id: string): Promise<Message[]> => {
  const response = await fetch(`${API_URL}/admin/swaps/${id}/messages`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load swap messages.')
  const rawMessages = Array.isArray(data.messages) ? data.messages as BackendRecord[] : []

  return rawMessages.map((item) => ({
    id: String(item._id ?? item.id ?? ''),
    swapId: getId(item.swap ?? item.swapId) || id,
    senderId: getId(item.sender ?? item.senderId),
    type: typeof item.type === 'string' ? item.type as Message['type'] : 'text',
    content: getString(item, 'content'),
    isAdminVisible: Boolean(item.is_admin_visible ?? item.isAdminVisible ?? true),
    isReported: Boolean(item.is_reported ?? item.isReported),
    reportReason: getString(item, 'report_reason', 'reportReason') || undefined,
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    readBy: Array.isArray(item.read_by)
      ? item.read_by.map(getId).filter(Boolean)
      : Array.isArray(item.readBy)
        ? item.readBy.map(getId).filter(Boolean)
        : [],
  }))
}

export const reviewAdminSwap = async (
  id: string,
  action: 'approve' | 'reject',
  adminNote: string
): Promise<AdminSwapDetailPayload> => {
  const response = await fetch(`${API_URL}/admin/swaps/${id}/${action}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ admin_notes: adminNote }),
  })
  const data = await assertOk(response, `Failed to ${action} swap.`)
  const rawSwap = typeof data.swap === 'object' && data.swap !== null ? data.swap as BackendRecord : {}
  const { users, products } = collectRecords([rawSwap])

  return {
    swap: mapSwap(rawSwap),
    users,
    products,
    reports: Array.isArray(data.reports) ? (data.reports as BackendRecord[]).map(mapReport) : [],
  }
}

export const cancelAdminSwap = async (
  id: string,
  adminNote: string
): Promise<AdminSwapCancelPayload> => {
  const response = await fetch(`${API_URL}/admin/swaps/${id}/cancel`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ admin_notes: adminNote }),
  })
  const data = await assertOk(response, 'Failed to cancel swap.')
  const rawSwap = typeof data.swap === 'object' && data.swap !== null ? data.swap as BackendRecord : {}
  const { users, products } = collectRecords([rawSwap])

  return {
    swap: mapSwap(rawSwap),
    users,
    products,
    reports: Array.isArray(data.reports) ? (data.reports as BackendRecord[]).map(mapReport) : [],
    serviceFeeReviewRequired: Boolean(data.service_fee_review_required ?? data.serviceFeeReviewRequired),
    completedServiceFeeTransactions: getNumber(data.completed_service_fee_transactions ?? data.completedServiceFeeTransactions),
    expiredServiceFeeTransactions: getNumber(data.expired_service_fee_transactions ?? data.expiredServiceFeeTransactions),
  }
}

export type DeliveryTrackingAction =
  | 'mark_requester_picked_up'
  | 'mark_receiver_picked_up'
  | 'mark_delivered_to_requester'
  | 'mark_delivered_to_receiver'

export const updateAdminDeliveryTracking = async (
  id: string,
  action: DeliveryTrackingAction
): Promise<AdminSwapDetailPayload> => {
  const response = await fetch(`${API_URL}/admin/swaps/${id}/delivery-tracking`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  })
  const data = await assertOk(response, 'Failed to update delivery tracking.')
  const rawSwap = typeof data.swap === 'object' && data.swap !== null ? data.swap as BackendRecord : {}
  const { users, products } = collectRecords([rawSwap])

  return {
    swap: mapSwap(rawSwap),
    users,
    products,
    reports: Array.isArray(data.reports) ? (data.reports as BackendRecord[]).map(mapReport) : [],
  }
}
