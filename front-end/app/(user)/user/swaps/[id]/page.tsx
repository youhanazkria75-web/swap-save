'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Flag,
  Lock,
  MapPin,
  MessageSquare,
  Package,
  Send,
  ShieldCheck,
  Star,
  Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Textarea } from '@/components/ui/form-elements'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import { SwapStatusBadge } from '@/components/shared/status-badges'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import egyptLocationsDataset from '@/lib/egypt_locations_english_dropdown_dataset.json'
import type {
  CompensationStatus,
  DeliveryDetails,
  DeliveryLifecycleStatus,
  ExchangeMethod,
  ExchangeProposalStatus,
  MeetupDetails,
  Product,
  ProductCondition,
  ProductStatus,
  Rating,
  SwapRequest,
  SwapStatus,
  SwapTimelineEvent,
  TrustLevel,
  User,
} from '@/types'

type BackendRecord = Record<string, unknown>
type ProfileLocation = {
  country: string
  city: string
  area: string
  streetAddress: string
}
type EgyptLocationArea = {
  name: string
  meeting_points: string[]
}
type EgyptLocationEntry = {
  governorate: string
  city: string
  areas: EgyptLocationArea[]
}
type SwapMessage = {
  id: string
  swapId: string
  senderId: string
  senderName: string
  senderAvatar?: string
  type: 'text' | 'system'
  content: string
  isAdminVisible: boolean
  isReported: boolean
  reportReason?: string
  createdAt: string
  readBy: string[]
}

type ServiceFeeReconcileResponse = {
  success?: boolean
  status?: 'unpaid' | 'pending' | 'completed' | 'failed' | 'expired'
  message?: string
  reason?: string
  purpose?: 'service_fee'
  swapId?: string
  swap?: BackendRecord | null
}

type SwapDetailDropdownOption = {
  value: string
  label: string
}

type SwapDetailDropdownProps = {
  value: string
  options: readonly SwapDetailDropdownOption[]
  onChange: (value: string) => void
  ariaLabel: string
  disabled?: boolean
}

function SwapDetailDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: SwapDetailDropdownProps) {
  const selectedOption = options.find(option => option.value === value)
  const selectedLabel = selectedOption?.label || options[0]?.label || 'Select'
  const isPlaceholder = !value

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors',
            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
            isPlaceholder && 'text-muted-foreground'
          )}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="z-[60] max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-white p-1 text-foreground shadow-lg"
      >
        {options.map(option => {
          const selected = option.value === value

          return (
            <DropdownMenuItem
              key={`${option.value}-${option.label}`}
              onSelect={() => onChange(option.value)}
              className={cn(
                'cursor-pointer justify-between rounded-lg px-2.5 py-2 text-sm',
                selected && 'bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary'
              )}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SWAP_PROGRESS_STEPS = [
  { key: 'request_sent', label: 'Request Sent' },
  { key: 'interest_accepted', label: 'Interest Accepted' },
  { key: 'discussion', label: 'Discussion' },
  { key: 'admin_review', label: 'Admin Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'service_fee', label: 'Service Fee' },
  { key: 'exchange_setup', label: 'Exchange Setup' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
] as const

const SWAP_STATUS_TO_STEP: Record<string, number> = {
  pending: 0,
  interested: 1,
  accepted: 2,
  in_discussion: 2,
  'in-discussion': 2,
  under_review: 3,
  'under-review': 3,
  approved: 4,
  payment_pending: 5,
  'payment-pending': 5,
  exchange_setup: 6,
  'exchange-setup': 6,
  in_progress: 7,
  'in-progress': 7,
  completed: 8,
}

const CHAT_ALLOWED_SWAP_STATUSES = ['in_discussion', 'in_progress']
const DISPUTE_ALLOWED_SWAP_STATUSES: SwapStatus[] = [
  'in_discussion',
  'under_review',
  'approved',
  'payment_pending',
  'exchange_setup',
  'in_progress',
]
const REPORT_ALLOWED_SWAP_STATUSES: SwapStatus[] = [
  ...DISPUTE_ALLOWED_SWAP_STATUSES,
  'disputed',
]
const USER_CANCELLABLE_SWAP_STATUSES: SwapStatus[] = [
  'pending',
  'in_discussion',
  'under_review',
  'approved',
  'payment_pending',
]

const EGYPT_COUNTRY = 'Egypt'
const EGYPT_LOCATIONS = egyptLocationsDataset as EgyptLocationEntry[]
const CITY_OPTIONS = EGYPT_LOCATIONS.map(location => location.city)
const SAFE_TIME_MIN = '09:00'
const SAFE_TIME_MAX = '18:00'
const SAFE_TIME_STEP_SECONDS = 15 * 60

const RATING_TAGS = ['punctual', 'item-as-described', 'friendly', 'communicative', 'trustworthy', 'honest']

const DELIVERY_STATUS_LABELS: Record<DeliveryLifecycleStatus, string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered_to_receiver: 'Delivered',
  delivery_completed: 'Delivery completed',
}

const DELIVERY_TIMELINE_STEPS: { status: DeliveryLifecycleStatus; label: string }[] = [
  { status: 'pending_pickup', label: 'Scheduled' },
  { status: 'picked_up', label: 'Picked up' },
  { status: 'in_transit', label: 'In transit' },
  { status: 'delivered_to_receiver', label: 'Delivered' },
  { status: 'delivery_completed', label: 'Completed' },
]

const getTodayDateValue = () => {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

const getEgyptLocation = (city: string) =>
  EGYPT_LOCATIONS.find(location => location.city === city.trim())

const getEgyptAreas = (city: string) => getEgyptLocation(city)?.areas ?? []

const getEgyptArea = (city: string, area: string) =>
  getEgyptAreas(city).find(item => item.name === area.trim())

const getEgyptMeetingPoints = (city: string, area: string) =>
  getEgyptArea(city, area)?.meeting_points ?? []

const normalizeCityValue = (city: string) => getEgyptLocation(city)?.city ?? ''

const normalizeAreaValue = (city: string, area: string) =>
  getEgyptArea(city, area)?.name ?? ''

const isPastDateValue = (date: string) => Boolean(date.trim()) && date < getTodayDateValue()

const getTimeMinutes = (time: string) => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  return hours * 60 + minutes
}

const isSafeTimeValue = (time: string) => {
  const value = getTimeMinutes(time)
  const min = getTimeMinutes(SAFE_TIME_MIN)
  const max = getTimeMinutes(SAFE_TIME_MAX)

  return value !== null && min !== null && max !== null && value >= min && value <= max
}

const getProgressStepIndex = (status: string) => SWAP_STATUS_TO_STEP[status] ?? 0

const getNumber = (item: BackendRecord, fallback: number, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return fallback
}

const getOptionalNumber = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return Number.NaN
}

const getBoolean = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return value.toLowerCase() === 'true'
  }

  return false
}

const getStringValue = (item: BackendRecord, ...keys: string[]) => {
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
    case 'rejected':
      return 'rejected'
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

const normalizeExchangeMethod = (method: unknown): ExchangeMethod | undefined => {
  return method === 'meetup' || method === 'delivery' ? method : undefined
}

const normalizeExchangeProposalStatus = (status: unknown): ExchangeProposalStatus => {
  if (status === 'pending' || status === 'accepted' || status === 'changes_requested') {
    return status
  }

  return 'none'
}

const normalizeCompensationStatus = (status: unknown): CompensationStatus => {
  if (status === 'proposed' || status === 'held' || status === 'released' || status === 'refunded' || status === 'rejected') {
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
  const city = typeof item.city === 'string' ? item.city : ''
  const area = typeof item.area === 'string' ? item.area : ''
  const meetingPoint =
    typeof item.meeting_point === 'string'
      ? item.meeting_point
      : typeof item.meetingPoint === 'string'
        ? item.meetingPoint
        : ''
  const date = typeof item.date === 'string' ? item.date : ''
  const time = typeof item.time === 'string' ? item.time : ''
  const additionalNotes =
    typeof item.additional_notes === 'string'
      ? item.additional_notes
      : typeof item.additionalNotes === 'string'
        ? item.additionalNotes
        : undefined

  if (!city && !area && !meetingPoint && !date && !time) return undefined

  return {
    city,
    area,
    meetingPoint,
    date,
    time,
    additionalNotes,
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
    address: typeof pickup.address === 'string' ? pickup.address : '',
    country: typeof pickup.country === 'string' ? pickup.country : '',
    city: typeof pickup.city === 'string' ? pickup.city : '',
    area: typeof pickup.area === 'string' ? pickup.area : '',
    preferredDate:
      typeof pickup.preferred_date === 'string'
        ? pickup.preferred_date
        : typeof pickup.preferredDate === 'string'
          ? pickup.preferredDate
          : '',
    preferredTime:
      typeof pickup.preferred_time === 'string'
        ? pickup.preferred_time
        : typeof pickup.preferredTime === 'string'
          ? pickup.preferredTime
          : '',
    notes: typeof pickup.notes === 'string' ? pickup.notes : undefined,
    submitted: Boolean(pickup.submitted),
  })

  const requesterPickup = mapPickup(requesterPickupRaw)
  const receiverPickup = mapPickup(receiverPickupRaw)
  const tracking = {
    requesterItemPickedUp: getBoolean(trackingRaw, 'requester_item_picked_up', 'requesterItemPickedUp'),
    receiverItemPickedUp: getBoolean(trackingRaw, 'receiver_item_picked_up', 'receiverItemPickedUp'),
    deliveredToRequester: getBoolean(trackingRaw, 'delivered_to_requester', 'deliveredToRequester'),
    deliveredToReceiver: getBoolean(trackingRaw, 'delivered_to_receiver', 'deliveredToReceiver'),
  }

  if (
    !requesterPickup.submitted &&
    !receiverPickup.submitted &&
    !requesterPickup.address &&
    !receiverPickup.address &&
    !tracking.requesterItemPickedUp &&
    !tracking.receiverItemPickedUp &&
    !tracking.deliveredToRequester &&
    !tracking.deliveredToReceiver
  ) {
    return undefined
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

const mapProfileLocation = (item: BackendRecord): ProfileLocation => ({
  country: getStringValue(item, 'country'),
  city: getStringValue(item, 'city'),
  area: getStringValue(item, 'area'),
  streetAddress: getStringValue(item, 'street_address', 'streetAddress'),
})

const trustLevelFromScore = (score: number, isSuspended = false): TrustLevel => {
  if (isSuspended) return 'risky'
  if (!Number.isFinite(score)) return 'new'
  if (score >= 70) return 'trusted'
  if (score >= 30) return 'new'
  return 'risky'
}

const mapUser = (item: BackendRecord): User => {
  const trustScore = getOptionalNumber(item, 'trust_score', 'trustScore')
  const completedSwaps = getOptionalNumber(item, 'completed_swaps', 'completedSwaps')
  const totalSwaps = getOptionalNumber(item, 'total_swaps', 'totalSwaps')
  const rating = getOptionalNumber(item, 'rating')
  const ratingCount = getOptionalNumber(item, 'rating_count', 'ratingCount')
  const isSuspended = getBoolean(item, 'isSuspended', 'is_suspended')

  return {
    id: String(item._id ?? item.id ?? ''),
    firstName: typeof item.first_name === 'string' ? item.first_name : typeof item.firstName === 'string' ? item.firstName : '',
    lastName: typeof item.last_name === 'string' ? item.last_name : typeof item.lastName === 'string' ? item.lastName : '',
    email: '',
    phone: undefined,
    avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
    country: typeof item.country === 'string' ? item.country : '',
    city: typeof item.city === 'string' ? item.city : '',
    streetAddress: undefined,
    bio: typeof item.bio === 'string' ? item.bio : undefined,
    joinedAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    isEmailVerified: getBoolean(item, 'isEmailVerified', 'is_email_verified'),
    isPhoneVerified: getBoolean(item, 'isPhoneVerified', 'is_phone_verified'),
    isAdmin: Boolean(item.role === 'admin' || item.isAdmin),
    trustLevel: trustLevelFromScore(trustScore, isSuspended),
    trustScore,
    completedSwaps,
    totalSwaps: Number.isFinite(totalSwaps) ? totalSwaps : completedSwaps,
    rating,
    ratingCount,
    coinBalance: getNumber(item, 0, 'coinBalance', 'coin_balance', 'coins'),
    heldCoins: getNumber(item, 0, 'heldCoins', 'held_coins'),
    featuredSlotsUsed: getNumber(item, 0, 'featuredSlotsUsed', 'featured_slots_used'),
    profileCompleteness: getNumber(item, 0, 'profileCompleteness', 'profile_completeness'),
    isSuspended,
    suspendedReason: typeof item.suspendedReason === 'string' ? item.suspendedReason : undefined,
    lastActiveAt: typeof item.lastActiveAt === 'string' ? item.lastActiveAt : '',
  }
}

const mapProduct = (item: BackendRecord): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId:
    typeof item.owner_id === 'object' && item.owner_id !== null
      ? String((item.owner_id as BackendRecord)._id ?? '')
      : String(item.owner_id ?? item.ownerId ?? ''),
  title: typeof item.title === 'string' ? item.title : '',
  description: typeof item.description === 'string' ? item.description : '',
  category: typeof item.category === 'string' ? item.category : '',
  subcategory: typeof item.subcategory === 'string' ? item.subcategory : '',
  condition: normalizeProductCondition(item.condition),
  estimatedValue: Number(item.estimated_value ?? item.estimatedValue ?? 0),
  location: typeof item.location === 'string' ? item.location : '',
  images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  status: normalizeProductStatus(item.status),
  isFeatured: Boolean(item.is_featured ?? item.isFeatured ?? false),
  featuredUntil: typeof item.featured_until === 'string' ? item.featured_until : typeof item.featuredUntil === 'string' ? item.featuredUntil : undefined,
  viewCount: Number(item.view_count ?? item.viewCount ?? 0),
  savedCount: Number(item.saved_count ?? item.savedCount ?? 0),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
})

const getRecordId = (value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    const record = value as BackendRecord
    return String(record._id ?? record.id ?? '')
  }

  return String(value ?? '')
}

const normalizeTimelineActor = (actor: unknown): SwapTimelineEvent['actor'] => {
  if (actor === 'requester' || actor === 'receiver' || actor === 'admin' || actor === 'system') {
    return actor
  }

  return 'system'
}

const mapTimelineEvent = (item: BackendRecord, swapId: string): SwapTimelineEvent => ({
  id: String(item._id ?? item.id ?? ''),
  swapId: getRecordId(item.swap ?? item.swapId) || swapId,
  event: typeof item.event === 'string' ? item.event : '',
  description: typeof item.description === 'string' ? item.description : '',
  actor: normalizeTimelineActor(item.actor),
  actorId: getRecordId(item.actor_id ?? item.actorId) || undefined,
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
})

const mapCurrentUserServiceFee = (value: unknown): SwapRequest['serviceFeeCurrentUser'] | undefined => {
  if (typeof value !== 'object' || value === null) return undefined

  const item = value as BackendRecord
  const side = item.side === 'requester' || item.side === 'receiver' ? item.side : undefined
  if (!side) return undefined

  const rawStatus = typeof item.status === 'string' ? item.status : ''
  const status: NonNullable<SwapRequest['serviceFeeCurrentUser']>['status'] =
    rawStatus === 'pending' ||
    rawStatus === 'completed' ||
    rawStatus === 'failed' ||
    rawStatus === 'expired' ||
    rawStatus === 'unpaid'
      ? rawStatus
      : getBoolean(item, 'paid')
        ? 'completed'
        : getBoolean(item, 'pending')
          ? 'pending'
          : 'unpaid'
  const checkoutUrl =
    getStringValue(item, 'checkout_url', 'checkoutUrl', 'payment_url', 'paymentUrl') ||
    getStringValue(item, 'iframe_url', 'iframeUrl')
  const iframeUrl = getStringValue(item, 'iframe_url', 'iframeUrl') || checkoutUrl

  return {
    side,
    paid: getBoolean(item, 'paid'),
    pending: status === 'pending' && (getBoolean(item, 'pending') || rawStatus === 'pending'),
    status,
    transactionId: getStringValue(item, 'transaction_id', 'transactionId') || undefined,
    checkoutUrl: checkoutUrl || undefined,
    paymentUrl: checkoutUrl || undefined,
    iframeUrl: iframeUrl || undefined,
    canContinue: Boolean(checkoutUrl) || getBoolean(item, 'can_continue', 'canContinue'),
    reason: getStringValue(item, 'reason') || undefined,
  }
}

const mapSwap = (item: BackendRecord) => {
  const requesterRaw = typeof item.requester === 'object' && item.requester !== null ? item.requester as BackendRecord : null
  const receiverRaw = typeof item.receiver === 'object' && item.receiver !== null ? item.receiver as BackendRecord : null
  const offeredProductRaw = typeof item.product_offered === 'object' && item.product_offered !== null ? item.product_offered as BackendRecord : null
  const requestedProductRaw = typeof item.product_requested === 'object' && item.product_requested !== null ? item.product_requested as BackendRecord : null

  if (!requesterRaw || !receiverRaw || !offeredProductRaw || !requestedProductRaw) return null

  const id = String(item._id ?? item.id ?? '')
  const requester = mapUser(requesterRaw)
  const receiver = mapUser(receiverRaw)
  const offeredProduct = mapProduct(offeredProductRaw)
  const requestedProduct = mapProduct(requestedProductRaw)
  const timeline = Array.isArray(item.timeline)
    ? item.timeline.map(event => mapTimelineEvent(event as BackendRecord, id))
    : []

  const swap: SwapRequest = {
    id,
    requesterId: requester.id,
    receiverId: receiver.id,
    offeredProductId: offeredProduct.id,
    requestedProductId: requestedProduct.id,
    status: normalizeSwapStatus(item.status),
    message: '',
    serviceFeeRequester: getNumber(item, 0, 'service_fee_requester', 'serviceFeeRequester'),
    serviceFeeReceiver: getNumber(item, 0, 'service_fee_receiver', 'serviceFeeReceiver'),
    requesterPaid: getBoolean(item, 'requester_paid', 'requesterPaid'),
    receiverPaid: getBoolean(item, 'receiver_paid', 'receiverPaid'),
    serviceFeeCurrentUser: mapCurrentUserServiceFee(item.current_user_service_fee ?? item.serviceFeeCurrentUser),
    exchangeMethod: normalizeExchangeMethod(item.exchange_method ?? item.exchangeMethod),
    meetupDetails: mapMeetupDetails(item.meetup_details ?? item.meetupDetails),
    deliveryDetails: mapDeliveryDetails(item.delivery_details ?? item.deliveryDetails),
    exchangeProposedBy: getRecordId(item.exchange_proposed_by ?? item.exchangeProposedBy) || undefined,
    exchangeAcceptedBy: getRecordId(item.exchange_accepted_by ?? item.exchangeAcceptedBy) || undefined,
    exchangeProposalStatus: normalizeExchangeProposalStatus(item.exchange_proposal_status ?? item.exchangeProposalStatus),
    compensationAmount: getNumber(item, 0, 'compensation_amount', 'compensationAmount'),
    compensationPayer: getRecordId(item.compensation_payer ?? item.compensationPayer) || undefined,
    compensationReceiver: getRecordId(item.compensation_receiver ?? item.compensationReceiver) || undefined,
    compensationStatus: normalizeCompensationStatus(item.compensation_status ?? item.compensationStatus),
    compensationProposedBy: getRecordId(item.compensation_proposed_by ?? item.compensationProposedBy) || undefined,
    compensationAcceptedBy: getRecordId(item.compensation_accepted_by ?? item.compensationAcceptedBy) || undefined,
    compensationProposedAt: typeof item.compensation_proposed_at === 'string' ? item.compensation_proposed_at : typeof item.compensationProposedAt === 'string' ? item.compensationProposedAt : undefined,
    compensationAcceptedAt: typeof item.compensation_accepted_at === 'string' ? item.compensation_accepted_at : typeof item.compensationAcceptedAt === 'string' ? item.compensationAcceptedAt : undefined,
    compensationRejectedAt: typeof item.compensation_rejected_at === 'string' ? item.compensation_rejected_at : typeof item.compensationRejectedAt === 'string' ? item.compensationRejectedAt : undefined,
    requesterConfirmed: getBoolean(item, 'requester_confirmed', 'requesterConfirmed'),
    receiverConfirmed: getBoolean(item, 'receiver_confirmed', 'receiverConfirmed'),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    timeline,
  }

  return { swap, requester, receiver, offeredProduct, requestedProduct }
}

const mapRating = (item: BackendRecord): Rating => ({
  id: String(item._id ?? item.id ?? ''),
  swapId: getRecordId(item.swap ?? item.swapId),
  raterId: getRecordId(item.rater ?? item.raterId),
  ratedUserId: getRecordId(item.rated_user ?? item.ratedUserId),
  score: getNumber(item, 0, 'score'),
  comment: typeof item.comment === 'string' ? item.comment : '',
  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
})

const mapMessage = (item: BackendRecord): SwapMessage => {
  const senderRaw =
    typeof item.sender === 'object' && item.sender !== null
      ? item.sender as BackendRecord
      : null
  const senderFirstName = senderRaw && typeof senderRaw.first_name === 'string' ? senderRaw.first_name : ''
  const senderLastName = senderRaw && typeof senderRaw.last_name === 'string' ? senderRaw.last_name : ''
  const senderName = `${senderFirstName} ${senderLastName}`.trim()
  const senderAvatar = senderRaw && typeof senderRaw.avatar === 'string' ? senderRaw.avatar : undefined

  return {
    id: String(item._id ?? item.id ?? ''),
    swapId: getRecordId(item.swap),
    senderId: getRecordId(item.sender),
    senderName,
    senderAvatar,
    type: item.type === 'system' ? 'system' : 'text',
    content: typeof item.content === 'string' ? item.content : '',
    isAdminVisible: Boolean(item.is_admin_visible ?? item.isAdminVisible ?? true),
    isReported: Boolean(item.is_reported ?? item.isReported ?? false),
    reportReason: typeof item.report_reason === 'string' ? item.report_reason : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    readBy: Array.isArray(item.read_by)
      ? item.read_by.map(getRecordId).filter(Boolean)
      : Array.isArray(item.readBy)
        ? item.readBy.map(getRecordId).filter(Boolean)
        : [],
  }
}

const getTimelineTone = (event: SwapTimelineEvent) => {
  if (['rejected', 'admin_rejected', 'cancelled', 'dispute_opened'].includes(event.event)) {
    return 'danger'
  }

  if ([
    'interest_accepted',
    'admin_approved',
    'service_fee_completed',
    'service_fees_completed',
    'exchange_setup_submitted',
    'exchange_proposal_accepted',
    'compensation_held',
    'compensation_released',
    'compensation_refunded',
    'completion_confirmed',
    'completed',
    'dispute_resolved',
    'report_resolved',
  ].includes(event.event)) {
    return 'success'
  }

  return 'neutral'
}

const formatTimelineEventName = (event: string) =>
  event
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const formatParticipantMetrics = (person: User) => {
  const trustText = Number.isFinite(person.trustScore)
    ? `Trust: ${person.trustScore}/100`
    : 'Trust: Not available'
  const swapsText = Number.isFinite(person.completedSwaps)
    ? `${person.completedSwaps} completed swaps`
    : 'Completed swaps not available'

  return `${trustText} - ${swapsText}`
}

export default function SwapDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { getCurrentUser, refreshWallet, updateUser } = useApp()
  const user = getCurrentUser()!

  const [swap, setSwap] = useState<SwapRequest | null>(null)
  const [requester, setRequester] = useState<User | null>(null)
  const [receiver, setReceiver] = useState<User | null>(null)
  const [offeredProduct, setOfferedProduct] = useState<Product | null>(null)
  const [requestedProduct, setRequestedProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [processingAction, setProcessingAction] = useState<'accept' | 'reject' | 'submit-review' | 'cancel' | 'pay-service-fee' | 'check-service-fee' | 'compensation-propose' | 'compensation-accept' | 'compensation-reject' | 'exchange-method' | 'exchange-accept' | 'exchange-changes' | 'confirm-completion' | null>(null)
  const [activeTab, setActiveTab] = useState('discussion')
  const [messages, setMessages] = useState<SwapMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(true)
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [ratings, setRatings] = useState<Rating[]>([])
  const [ratingsLoading, setRatingsLoading] = useState(true)
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingTags, setRatingTags] = useState<string[]>([])
  const [submittingRating, setSubmittingRating] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeDescription, setDisputeDescription] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [exchangeMode, setExchangeMode] = useState<ExchangeMethod | null>(null)
  const [meetupForm, setMeetupForm] = useState<MeetupDetails>({
    city: '',
    area: '',
    meetingPoint: '',
    date: '',
    time: '',
    additionalNotes: '',
  })
  const [deliveryForm, setDeliveryForm] = useState({
    address: '',
    country: EGYPT_COUNTRY,
    city: '',
    area: '',
    preferredDate: '',
    preferredTime: '',
    notes: '',
  })
  const [profileLocation, setProfileLocation] = useState<ProfileLocation | null>(null)
  const [deliveryPrefilled, setDeliveryPrefilled] = useState(false)
  const [compensationAmount, setCompensationAmount] = useState('')

  const applyWalletFromResponse = (data: unknown) => {
    const wallet =
      typeof data === 'object' && data !== null && 'wallet' in data
        ? (data as { wallet?: {
            coins?: number
            held_coins?: number
            total_coins_earned?: number
            total_coins_spent?: number
            monthly_free_swaps_used?: number
            extra_swap_slots?: number
            priority_matches_available?: number
          } }).wallet
        : undefined

    if (!wallet) return

    updateUser(user.id, {
      coinBalance: Number(wallet.coins ?? user.coinBalance),
      heldCoins: Number(wallet.held_coins ?? user.heldCoins ?? 0),
      totalCoinsEarned: Number(wallet.total_coins_earned ?? user.totalCoinsEarned ?? 0),
      totalCoinsSpent: Number(wallet.total_coins_spent ?? user.totalCoinsSpent ?? 0),
      monthlyFreeSwapsUsed: Number(wallet.monthly_free_swaps_used ?? user.monthlyFreeSwapsUsed ?? 0),
      extraSwapSlots: Number(wallet.extra_swap_slots ?? user.extraSwapSlots ?? 0),
      priorityMatchesAvailable: Number(wallet.priority_matches_available ?? user.priorityMatchesAvailable ?? 0),
    })
  }

  useEffect(() => {
    let cancelled = false

    const loadSwap = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/swaps/${id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token')
            router.push('/login')
            return
          }

          throw new Error(
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to load swap.'
          )
        }

        const swapData =
          typeof data === 'object' &&
          data !== null &&
          'swap' in data &&
          typeof data.swap === 'object' &&
          data.swap !== null
            ? data.swap as BackendRecord
            : null

        const mapped = swapData ? mapSwap(swapData) : null

        if (!cancelled) {
          setSwap(mapped?.swap ?? null)
          setRequester(mapped?.requester ?? null)
          setReceiver(mapped?.receiver ?? null)
          setOfferedProduct(mapped?.offeredProduct ?? null)
          setRequestedProduct(mapped?.requestedProduct ?? null)
        }

        if (!cancelled) {
          refreshWallet().catch(() => {})
        }
      } catch (error) {
        if (!cancelled) {
          setSwap(null)
          toast.error(error instanceof Error ? error.message : 'Failed to load swap.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSwap()

    return () => {
      cancelled = true
    }
  }, [id, refreshWallet, router])

  useEffect(() => {
    let cancelled = false

    const loadProfileLocation = async () => {
      const token = localStorage.getItem('token') || ''
      if (!token) return

      try {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) return

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        const accountUser =
          typeof data === 'object' &&
          data !== null &&
          'user' in data &&
          typeof data.user === 'object' &&
          data.user !== null
            ? data.user as BackendRecord
            : null

        if (!cancelled && accountUser) {
          setProfileLocation(mapProfileLocation(accountUser))
        }
      } catch {
        if (!cancelled) {
          setProfileLocation(null)
        }
      }
    }

    loadProfileLocation()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!profileLocation || deliveryPrefilled || !swap) return

    const isCurrentRequester = String(swap.requesterId) === String(user.id)
    const currentPickup = isCurrentRequester
      ? swap.deliveryDetails?.requesterPickup
      : swap.deliveryDetails?.receiverPickup
    const shouldPrefill =
      exchangeMode === 'delivery' ||
      (swap.exchangeMethod === 'delivery' && !currentPickup?.submitted)

    if (!shouldPrefill) return

    setDeliveryForm(current => {
      const nextCity = normalizeCityValue(current.city) || normalizeCityValue(profileLocation.city)
      const nextArea = normalizeAreaValue(nextCity, current.area) || normalizeAreaValue(nextCity, profileLocation.area)

      return {
        ...current,
        address: current.address || profileLocation.streetAddress,
        country: EGYPT_COUNTRY,
        city: nextCity,
        area: nextArea,
      }
    })
    setDeliveryPrefilled(true)
  }, [deliveryPrefilled, exchangeMode, profileLocation, swap, user.id])

  useEffect(() => {
    let cancelled = false

    const loadRatings = async () => {
      try {
        setRatingsLoading(true)
        const response = await fetch(`${API_BASE_URL}/swaps/${id}/ratings`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token')
            router.push('/login')
            return
          }

          throw new Error(
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to load ratings.'
          )
        }

        const rawRatings =
          typeof data === 'object' &&
          data !== null &&
          'ratings' in data &&
          Array.isArray(data.ratings)
            ? data.ratings
            : []

        if (!cancelled) {
          setRatings(rawRatings.map((rating) => mapRating(rating as BackendRecord)))
        }
      } catch {
        if (!cancelled) {
          setRatings([])
        }
      } finally {
        if (!cancelled) {
          setRatingsLoading(false)
        }
      }
    }

    loadRatings()

    return () => {
      cancelled = true
    }
  }, [id, router])

  useEffect(() => {
    let cancelled = false

    const loadMessages = async () => {
      try {
        setMessagesLoading(true)
        const response = await fetch(`${API_BASE_URL}/swaps/${id}/messages`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token')
            router.push('/login')
            return
          }

          throw new Error(
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to load messages.'
          )
        }

        const items =
          typeof data === 'object' &&
          data !== null &&
          'messages' in data &&
          Array.isArray(data.messages)
            ? data.messages
            : []

        if (!cancelled) {
          setMessages(items.map((item) => mapMessage(item as BackendRecord)))
        }
      } catch (error) {
        if (!cancelled) {
          setMessages([])
          toast.error(error instanceof Error ? error.message : 'Failed to load messages.')
        }
      } finally {
        if (!cancelled) {
          setMessagesLoading(false)
        }
      }
    }

    loadMessages()

    return () => {
      cancelled = true
    }
  }, [id, router])

  const handleSwapAction = async (action: 'accept' | 'reject') => {
    if (!swap) return

    try {
      setProcessingAction(action)
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/${action}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : `Failed to ${action} swap.`
        )
      }

      setSwap((current) =>
        current
          ? {
              ...current,
              status: action === 'accept' ? 'in_discussion' : 'rejected',
              updatedAt: new Date().toISOString(),
            }
          : current
      )
      refreshWallet().catch(() => {})
      toast.success(action === 'accept' ? 'Swap accepted' : 'Swap rejected')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} swap.`)
    } finally {
      setProcessingAction(null)
    }
  }

  const handleSubmitForReview = async () => {
    if (!swap) return

    try {
      setProcessingAction('submit-review')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/submit-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to submit swap for admin review.'
        )
      }

      setSwap((current) =>
        current
          ? {
              ...current,
              status: 'under_review',
              updatedAt: new Date().toISOString(),
            }
          : current
      )
      toast.success('Swap submitted for admin review')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit swap for admin review.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleCancelSwap = async () => {
    if (!swap) return

    try {
      setProcessingAction('cancel')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to cancel swap.'
        )
      }

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null
      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      } else {
        setSwap(current =>
          current
            ? {
                ...current,
                status: 'cancelled',
                updatedAt: new Date().toISOString(),
              }
            : current
        )
      }

      setShowCancelModal(false)
      setActiveTab('timeline')
      toast.success('Swap cancelled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel swap.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handlePayServiceFee = async () => {
    if (!swap) return

    try {
      setProcessingAction('pay-service-fee')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/service-fee/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to pay service fee.'
        )
      }

      const responseData = typeof data === 'object' && data !== null ? data as BackendRecord : null
      const paymentUrl = responseData
        ? getStringValue(responseData, 'checkoutUrl', 'paymentUrl', 'iframeUrl')
        : ''

      if (!paymentUrl) {
        throw new Error('Payment checkout URL was missing.')
      }

      window.location.href = paymentUrl
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start service fee checkout.')
      setProcessingAction(null)
    } finally {
      if (typeof window === 'undefined') {
        setProcessingAction(null)
      }
    }
  }

  const handleContinueServiceFeePayment = () => {
    if (!swap) return

    const paymentUrl =
      swap.serviceFeeCurrentUser?.checkoutUrl ||
      swap.serviceFeeCurrentUser?.paymentUrl ||
      swap.serviceFeeCurrentUser?.iframeUrl ||
      ''

    if (!paymentUrl) {
      void handlePayServiceFee()
      return
    }

    setProcessingAction('pay-service-fee')
    window.location.href = paymentUrl
  }

  const handleCheckServiceFeeStatus = async () => {
    if (!swap) return

    try {
      setProcessingAction('check-service-fee')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/service-fee/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      const data = await response.json().catch(() => null) as ServiceFeeReconcileResponse | null
      const applyServiceFeeResult = (
        nextStatus: NonNullable<SwapRequest['serviceFeeCurrentUser']>['status'],
        reason?: string,
      ) => {
        setSwap(current => {
          if (!current) return current

          const side = current.requesterId === user.id ? 'requester' : 'receiver'
          const rawSwap = data?.swap && typeof data.swap === 'object' ? data.swap : null
          const currentUserPaidNext = nextStatus === 'completed'
          const requesterPaidNext = rawSwap
            ? getBoolean(rawSwap, 'requester_paid', 'requesterPaid')
            : side === 'requester'
              ? currentUserPaidNext
              : current.requesterPaid
          const receiverPaidNext = rawSwap
            ? getBoolean(rawSwap, 'receiver_paid', 'receiverPaid')
            : side === 'receiver'
              ? currentUserPaidNext
              : current.receiverPaid
          const rawSwapStatus = rawSwap && typeof rawSwap.status === 'string' ? rawSwap.status : ''

          return {
            ...current,
            status: rawSwapStatus ? normalizeSwapStatus(rawSwapStatus) : current.status,
            requesterPaid: requesterPaidNext,
            receiverPaid: receiverPaidNext,
            serviceFeeCurrentUser: {
              ...(current.serviceFeeCurrentUser || { side }),
              side,
              paid: currentUserPaidNext,
              pending: nextStatus === 'pending',
              status: nextStatus,
              reason: reason || undefined,
            },
          }
        })
      }

      if (data?.success === true || data?.status === 'completed') {
        const mapped = data?.swap ? mapSwap(data.swap) : null
        if (mapped) {
          setSwap(mapped.swap)
          setRequester(mapped.requester)
          setReceiver(mapped.receiver)
          setOfferedProduct(mapped.offeredProduct)
          setRequestedProduct(mapped.requestedProduct)
        } else {
          applyServiceFeeResult('completed')
        }

        toast.success('Service fee confirmed')
        return
      }

      if (data?.status === 'failed' || data?.status === 'expired' || data?.status === 'unpaid') {
        applyServiceFeeResult(data.status, data.reason || data.message)
        toast.error(data.reason || data.message || 'This payment is not active. You can start a new service fee payment.')
        return
      }

      if (!response.ok && response.status !== 202) {
        throw new Error(data?.reason || data?.message || 'Could not verify the service fee payment.')
      }

      if (data?.status === 'pending') {
        applyServiceFeeResult('pending', data.reason || data.message)
      }

      toast.info('Payment has not been confirmed yet. You can continue or try payment again.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not check service fee status.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleCompensationAction = async (action: 'propose' | 'accept' | 'reject') => {
    if (!swap) return

    const amount = Number(compensationAmount)

    if (action === 'propose' && (!Number.isInteger(amount) || amount <= 0)) {
      toast.error('Enter a positive whole number of coins')
      return
    }

    try {
      setProcessingAction(`compensation-${action}` as typeof processingAction)
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/compensation/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: action === 'propose' ? JSON.stringify({ amount }) : undefined,
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to update coin compensation.'
        )
      }

      applyWalletFromResponse(data)

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null

      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      }

      if (action === 'propose') {
        setCompensationAmount('')
      }

      toast.success(
        action === 'propose'
          ? 'Coin compensation proposed'
          : action === 'accept'
            ? 'Coin compensation accepted and held'
            : 'Coin compensation rejected'
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update coin compensation.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleSetExchangeMethod = async (method: ExchangeMethod) => {
    if (!swap) return

    if (method === 'meetup') {
      if (!meetupForm.city.trim()) {
        toast.error('Please select a meetup city')
        return
      }
      if (!meetupForm.area.trim()) {
        toast.error('Please select a meetup area')
        return
      }
      if (!meetupForm.date.trim()) {
        toast.error('Please choose a meetup date')
        return
      }
      if (!meetupForm.time.trim()) {
        toast.error('Please choose a meetup time')
        return
      }
      if (!getEgyptLocation(meetupForm.city) || !getEgyptArea(meetupForm.city, meetupForm.area)) {
        toast.error('Please select a valid city and area')
        return
      }
      if (!meetupForm.meetingPoint.trim()) {
        toast.error('Please choose a suggested meeting point or enter a custom location')
        return
      }
      if (isPastDateValue(meetupForm.date)) {
        toast.error('Please choose today or a future meetup date')
        return
      }
      if (!isSafeTimeValue(meetupForm.time)) {
        toast.error(`Please choose a meetup time between ${SAFE_TIME_MIN} and ${SAFE_TIME_MAX}`)
        return
      }
    }

    if (method === 'delivery') {
      if (!deliveryForm.address.trim()) {
        toast.error('Please enter a pickup address')
        return
      }
      if (!deliveryForm.country.trim()) {
        toast.error('Please select a pickup country')
        return
      }
      if (!deliveryForm.city.trim()) {
        toast.error('Please select a pickup city')
        return
      }
      if (!deliveryForm.area.trim()) {
        toast.error('Please select a pickup area')
        return
      }
      if (!deliveryForm.preferredDate.trim()) {
        toast.error('Please choose a pickup date')
        return
      }
      if (!deliveryForm.preferredTime.trim()) {
        toast.error('Please choose a pickup time')
        return
      }
      if (deliveryForm.country !== EGYPT_COUNTRY) {
        toast.error('Pickup country must be Egypt')
        return
      }
      if (!getEgyptLocation(deliveryForm.city) || !getEgyptArea(deliveryForm.city, deliveryForm.area)) {
        toast.error('Please select a valid pickup city and area')
        return
      }
      if (isPastDateValue(deliveryForm.preferredDate)) {
        toast.error('Please choose today or a future pickup date')
        return
      }
      if (!isSafeTimeValue(deliveryForm.preferredTime)) {
        toast.error(`Please choose a pickup time between ${SAFE_TIME_MIN} and ${SAFE_TIME_MAX}`)
        return
      }
    }

    try {
      setProcessingAction('exchange-method')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/exchange-method`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          exchange_method: method,
          meetup_details: method === 'meetup'
            ? {
                city: meetupForm.city,
                area: meetupForm.area,
                meeting_point: meetupForm.meetingPoint,
                date: meetupForm.date,
                time: meetupForm.time,
                additional_notes: meetupForm.additionalNotes,
              }
            : undefined,
          delivery_details: method === 'delivery'
            ? {
                pickup_address: deliveryForm.address,
                pickup_country: deliveryForm.country,
                pickup_city: deliveryForm.city,
                pickup_area: deliveryForm.area,
                preferred_pickup_date: deliveryForm.preferredDate,
                preferred_pickup_time: deliveryForm.preferredTime,
                pickup_notes: deliveryForm.notes,
              }
            : undefined,
        }),
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to submit exchange method.'
        )
      }

      applyWalletFromResponse(data)

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null

      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      }

      setExchangeMode(null)
      toast.success(method === 'meetup' ? 'Meetup proposed. Waiting for the other participant to accept.' : mapped?.swap.status === 'in_progress' ? 'Both pickup details submitted. Delivery is now in progress.' : 'Pickup details submitted. Waiting for the other participant.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit exchange method.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleAcceptExchangeMethod = async () => {
    if (!swap) return

    try {
      setProcessingAction('exchange-accept')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/exchange-method/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to accept exchange details.'
        )
      }

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null

      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      }

      toast.success('Exchange details accepted. Swap is now in progress.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept exchange details.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleRequestExchangeChanges = async () => {
    if (!swap) return

    try {
      setProcessingAction('exchange-changes')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/exchange-method/request-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to request changes.'
        )
      }

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null

      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      }

      toast.success('Changes requested. The other participant can submit a new proposal.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to request changes.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleConfirmCompletion = async () => {
    if (!swap) return

    try {
      setProcessingAction('confirm-completion')
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/confirm-completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to confirm completion.'
        )
      }

      applyWalletFromResponse(data)

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null

      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      }

      toast.success(mapped?.swap.status === 'completed' ? 'Swap completed!' : 'Completion confirmed. Waiting for the other participant.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to confirm completion.')
    } finally {
      setProcessingAction(null)
    }
  }

  const handleSubmitRating = async () => {
    if (!swap) return

    if (!ratingScore) {
      toast.error('Please select a star rating')
      return
    }

    if (ratingComment.length > 1000) {
      toast.error('Rating comment cannot exceed 1000 characters.')
      return
    }

    try {
      setSubmittingRating(true)
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          score: ratingScore,
          tags: ratingTags,
          comment: ratingComment,
        }),
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to submit rating.'
        )
      }

      const ratingData =
        typeof data === 'object' &&
        data !== null &&
        'rating' in data &&
        typeof data.rating === 'object' &&
        data.rating !== null
          ? data.rating as BackendRecord
          : null

      if (ratingData) {
        const rating = mapRating(ratingData)
        setRatings((current) => [rating, ...current.filter((item) => item.id !== rating.id)])
        setRatingScore(0)
        setRatingComment('')
        setRatingTags([])
      }

      const ratedUserData =
        typeof data === 'object' &&
        data !== null &&
        'rated_user' in data &&
        typeof data.rated_user === 'object' &&
        data.rated_user !== null
          ? data.rated_user as BackendRecord
          : null

      if (ratedUserData) {
        const ratedUser = mapUser(ratedUserData)
        if (ratedUser.id === requester?.id) {
          setRequester(ratedUser)
        }
        if (ratedUser.id === receiver?.id) {
          setReceiver(ratedUser)
        }
        updateUser(ratedUser.id, ratedUser)
      }

      toast.success('Rating submitted! Thank you.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit rating.')
    } finally {
      setSubmittingRating(false)
    }
  }

  const submitSwapReport = async (payload: { target_type: 'swap' | 'message'; reason: string; description?: string }) => {
    if (!swap) return false

    try {
      setSubmittingReport(true)
      const response = await fetch(`${API_BASE_URL}/swaps/${swap.id}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(payload),
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to submit report.'
        )
      }

      const swapData =
        typeof data === 'object' &&
        data !== null &&
        'swap' in data &&
        typeof data.swap === 'object' &&
        data.swap !== null
          ? data.swap as BackendRecord
          : null

      const mapped = swapData ? mapSwap(swapData) : null

      if (mapped) {
        setSwap(mapped.swap)
        setRequester(mapped.requester)
        setReceiver(mapped.receiver)
        setOfferedProduct(mapped.offeredProduct)
        setRequestedProduct(mapped.requestedProduct)
      }

      toast.success(payload.target_type === 'swap' ? 'Dispute opened. Our admin team will review it.' : 'Report submitted. Our team will review it.')
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit report.')
      return false
    } finally {
      setSubmittingReport(false)
    }
  }

  const handleSubmitReport = async () => {
    if (!reportReason.trim()) {
      toast.error('Please select a reason')
      return
    }

    const submitted = await submitSwapReport({
      target_type: 'message',
      reason: reportReason,
      description: `Report from swap discussion #${swap?.id}`,
    })

    if (submitted) {
      setShowReportModal(false)
      setReportReason('')
    }
  }

  const handleOpenDispute = async () => {
    if (!disputeReason.trim() || !disputeDescription.trim()) {
      toast.error('Please describe the dispute')
      return
    }

    const submitted = await submitSwapReport({
      target_type: 'swap',
      reason: disputeReason,
      description: disputeDescription,
    })

    if (submitted) {
      setShowDisputeModal(false)
      setDisputeReason('')
      setDisputeDescription('')
    }
  }

  const handleSendMessage = async () => {
    const content = messageText.trim()
    if (!content || sendingMessage) return

    if (!swap || !CHAT_ALLOWED_SWAP_STATUSES.includes(swap.status)) {
      toast.error('Messaging is unavailable at this stage.')
      return
    }

    if (content.length > 1000) {
      toast.error('Message cannot exceed 1000 characters.')
      return
    }

    try {
      setSendingMessage(true)
      const response = await fetch(`${API_BASE_URL}/swaps/${id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ content }),
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to send message.'
        )
      }

      const messageData =
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof data.message === 'object' &&
        data.message !== null
          ? data.message as BackendRecord
          : null

      if (messageData) {
        setMessages((current) => [...current, mapMessage(messageData)])
      }
      setMessageText('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send message.')
    } finally {
      setSendingMessage(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Loading swap...</p>
      </div>
    )
  }

  if (!swap || !requester || !receiver || !offeredProduct || !requestedProduct) {
    return (
      <div className="text-center py-20">
        <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Swap not found</p>
        <Button asChild variant="outline" className="mt-4"><Link href="/user/swaps">Back to swaps</Link></Button>
      </div>
    )
  }

  const isRequester = swap.requesterId === user.id
  const currentUserFee = isRequester ? swap.serviceFeeRequester : swap.serviceFeeReceiver
  const currentUserPaid = isRequester ? swap.requesterPaid : swap.receiverPaid
  const otherParticipantPaid = isRequester ? swap.receiverPaid : swap.requesterPaid
  const currentUserServiceFeePending =
    !currentUserPaid && swap.serviceFeeCurrentUser?.status === 'pending' && swap.serviceFeeCurrentUser?.pending === true
  const currentUserServiceFeeCheckoutUrl =
    swap.serviceFeeCurrentUser?.checkoutUrl ||
    swap.serviceFeeCurrentUser?.paymentUrl ||
    swap.serviceFeeCurrentUser?.iframeUrl ||
    ''
  const currentUserConfirmed = isRequester ? swap.requesterConfirmed : swap.receiverConfirmed
  const otherParticipantConfirmed = isRequester ? swap.receiverConfirmed : swap.requesterConfirmed
  const currentUserRating = ratings.find((rating) => rating.raterId === user.id)
  const canOpenDispute = DISPUTE_ALLOWED_SWAP_STATUSES.includes(swap.status)
  const canReportDiscussion = REPORT_ALLOWED_SWAP_STATUSES.includes(swap.status)
  const exchangeProposalStatus = swap.exchangeProposalStatus || 'none'
  const currentUserProposedExchange = Boolean(swap.exchangeProposedBy && swap.exchangeProposedBy === user.id)
  const otherParticipantProposedExchange = Boolean(swap.exchangeProposedBy && swap.exchangeProposedBy !== user.id)
  const currentDeliveryPickup = isRequester ? swap.deliveryDetails?.requesterPickup : swap.deliveryDetails?.receiverPickup
  const otherDeliveryPickup = isRequester ? swap.deliveryDetails?.receiverPickup : swap.deliveryDetails?.requesterPickup
  const currentUserSubmittedDelivery = Boolean(currentDeliveryPickup?.submitted)
  const otherParticipantSubmittedDelivery = Boolean(otherDeliveryPickup?.submitted)
  const isPlatformDelivery = swap.exchangeMethod === 'delivery' || Boolean(swap.deliveryDetails)
  const deliveryStatus = swap.deliveryDetails?.deliveryStatus ?? 'pending_pickup'
  const deliveryCompleted = !isPlatformDelivery || deliveryStatus === 'delivery_completed'
  const deliveryStatusIndex = DELIVERY_TIMELINE_STEPS.findIndex(step => step.status === deliveryStatus)
  const deliveryTimelineIndex = Math.max(0, deliveryStatusIndex)
  const todayDate = getTodayDateValue()
  const meetupAreaOptions = getEgyptAreas(meetupForm.city)
  const meetupMeetingPoints = getEgyptMeetingPoints(meetupForm.city, meetupForm.area)
  const deliveryAreaOptions = getEgyptAreas(deliveryForm.city)
  const canSubmitExchangeProposal = swap.status === 'exchange_setup' && (exchangeProposalStatus === 'none' || exchangeProposalStatus === 'changes_requested') && !(isPlatformDelivery && currentUserSubmittedDelivery)
  const canAcceptExchangeProposal = swap.status === 'exchange_setup' && exchangeProposalStatus === 'pending' && otherParticipantProposedExchange
  const canSendMessage = CHAT_ALLOWED_SWAP_STATUSES.includes(swap.status)
  const showServiceFeeStatus = ['approved', 'payment_pending', 'exchange_setup', 'in_progress', 'completed'].includes(swap.status)
  const canPayServiceFee = ['approved', 'payment_pending'].includes(swap.status)
  const canContinueServiceFee =
    canPayServiceFee &&
    currentUserServiceFeePending &&
    Boolean(currentUserServiceFeeCheckoutUrl)
  const canRetryServiceFee =
    canPayServiceFee &&
    !currentUserPaid &&
    (
      swap.serviceFeeCurrentUser?.status === 'failed' ||
      swap.serviceFeeCurrentUser?.status === 'expired' ||
      (currentUserServiceFeePending && !currentUserServiceFeeCheckoutUrl)
    )
  const canModerate = swap.status === 'pending' && swap.receiverId === user.id
  const canCancelSwap =
    USER_CANCELLABLE_SWAP_STATUSES.includes(swap.status) &&
    !(swap.status === 'payment_pending' && (currentUserPaid || otherParticipantPaid))
  const other = isRequester ? receiver : requester
  const currentParticipant = isRequester ? requester : receiver
  const yourProduct = isRequester ? offeredProduct : requestedProduct
  const otherProduct = isRequester ? requestedProduct : offeredProduct
  const offeredValue = offeredProduct.estimatedValue
  const requestedValue = requestedProduct.estimatedValue
  const valueGap = Math.abs(offeredValue - requestedValue)
  const lowerValueParticipantId =
    offeredValue < requestedValue
      ? swap.requesterId
      : requestedValue < offeredValue
        ? swap.receiverId
        : undefined
  const currentUserIsLowerValueOwner = lowerValueParticipantId === user.id
  const currentUserCoinBalance = Number.isFinite(currentParticipant.coinBalance)
    ? currentParticipant.coinBalance
    : user.coinBalance
  const currentUserHeldCoins = Number(currentParticipant.heldCoins ?? 0)
  const compensationStatus = swap.compensationStatus || 'none'
  const compensationAmountValue = Number(swap.compensationAmount || 0)
  const currentUserIsCompensationPayer = swap.compensationPayer === user.id
  const currentUserIsCompensationReceiver = swap.compensationReceiver === user.id
  const compensationProposer =
    swap.compensationProposedBy === requester.id
      ? requester
      : swap.compensationProposedBy === receiver.id
        ? receiver
        : currentUserIsCompensationPayer
          ? currentParticipant
          : other
  const showCompensationSection = swap.status === 'in_discussion' || compensationStatus !== 'none'
  const timeline = swap.timeline
  const isTerminal = ['rejected', 'cancelled', 'disputed'].includes(swap.status)
  const currentStepIdx = getProgressStepIndex(swap.status)
  const nextActionText = (() => {
    if (canModerate) return 'You can accept or reject this pending request.'
    if (swap.status === 'pending' && isRequester) return `Waiting for ${receiver.firstName || 'the receiver'} to accept or reject this request.`
    if (swap.status === 'in_discussion') return 'This swap is in discussion.'
    if (swap.status === 'under_review') return 'This swap is under admin review.'
    if (swap.status === 'approved') return 'This swap has been approved. Pay the service fee to continue.'
    if (swap.status === 'payment_pending') return 'Waiting for both service fees to be paid.'
    if (swap.status === 'exchange_setup') {
      if (isPlatformDelivery && currentUserSubmittedDelivery && !otherParticipantSubmittedDelivery) return 'Waiting for the other participant to submit pickup details.'
      if (isPlatformDelivery && otherParticipantSubmittedDelivery && !currentUserSubmittedDelivery) return 'Submit your pickup details for platform delivery.'
      if (exchangeProposalStatus === 'pending' && currentUserProposedExchange) return 'Waiting for the other participant to accept exchange details.'
      if (exchangeProposalStatus === 'pending' && otherParticipantProposedExchange) return 'Review and accept the proposed exchange details to start the exchange.'
      if (exchangeProposalStatus === 'changes_requested') return 'Changes were requested. Submit updated exchange details.'
      return 'Both service fees are paid. Propose exchange details next.'
    }
    if (swap.status === 'in_progress') {
      if (isPlatformDelivery && !deliveryCompleted) return `Delivery is ${DELIVERY_STATUS_LABELS[deliveryStatus].toLowerCase()}. Completion unlocks after delivery is completed.`
      return 'The exchange is in progress. Confirm completion after receiving and inspecting the item.'
    }
    if (swap.status === 'completed') return 'This swap is complete.'
    if (swap.status === 'rejected') return 'This swap request has been rejected.'
    if (swap.status === 'disputed') return 'This swap is paused while an admin reviews the dispute.'
    return 'No action is needed right now.'
  })()

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/user/swaps"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">
              {offeredProduct.title} <span className="text-muted-foreground">for</span> {requestedProduct.title}
            </h1>
            <SwapStatusBadge status={swap.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            With {other.firstName} {other.lastName} - {format(new Date(swap.createdAt), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {!isTerminal && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Swap progress</p>
            <span className="text-xs text-muted-foreground">
              Step {currentStepIdx + 1} of {SWAP_PROGRESS_STEPS.length}
            </span>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
            {SWAP_PROGRESS_STEPS.map((step, i) => {
              const done = i < currentStepIdx
              const current = i === currentStepIdx

              return (
                <div key={step.key} className="flex items-center gap-1 shrink-0">
                  <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all',
                    done ? 'bg-primary text-primary-foreground' :
                    current ? 'bg-primary/15 text-primary border border-primary' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {done && <Check className="h-3 w-3" />}
                    {current && <div className="swap-current-step-indicator h-2 w-2 rounded-full bg-primary" />}
                    {!done && !current && <Lock className="h-3 w-3" />}
                    {step.label}
                  </div>
                  {i < SWAP_PROGRESS_STEPS.length - 1 && (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
          <style jsx>{`
            .swap-current-step-indicator {
              animation: swap-current-step-pulse 1.8s ease-in-out infinite;
              background-color: #f59e0b;
              box-shadow: 0 0 0 3px rgb(245 158 11 / 0.24);
            }

            @keyframes swap-current-step-pulse {
              0%, 100% {
                opacity: 1;
                transform: scale(1);
                box-shadow: 0 0 0 3px rgb(245 158 11 / 0.24);
              }
              50% {
                opacity: 0.76;
                transform: scale(1.12);
                box-shadow: 0 0 0 5px rgb(251 146 60 / 0.16);
              }
            }

            @media (prefers-reduced-motion: reduce) {
              .swap-current-step-indicator {
                animation: none;
                opacity: 1;
                transform: none;
                box-shadow: 0 0 0 3px rgb(245 158 11 / 0.24);
              }
            }
          `}</style>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Status</p>
          <SwapStatusBadge status={swap.status} />
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Created</p>
          <p className="text-sm font-medium">{format(new Date(swap.createdAt), 'MMM d, yyyy h:mm a')}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Updated</p>
          <p className="text-sm font-medium">{format(new Date(swap.updatedAt), 'MMM d, yyyy h:mm a')}</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Next action</p>
        <p className="text-sm text-muted-foreground">{nextActionText}</p>
      </div>

      {(swap.status === 'rejected' || swap.status === 'disputed') && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border bg-red-50 border-red-200">
          {swap.status === 'disputed' ? (
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
          )}
          <div>
            <p className="font-semibold text-sm">{swap.status === 'disputed' ? 'Dispute Opened' : 'Swap Rejected'}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {swap.status === 'disputed'
                ? 'This swap is paused while admins review the issue.'
                : 'This request was rejected.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="discussion">
                <MessageSquare className="h-4 w-4 mr-1.5" /> Discussion
              </TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="exchange">Exchange</TabsTrigger>
              {swap.status === 'completed' && (
                <TabsTrigger value="rating">
                  <Star className="h-4 w-4 mr-1.5" /> Rate {other.firstName || 'user'}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="discussion" className="mt-4">
              {showCompensationSection && (
                <div className="bg-card rounded-2xl border border-border p-5 mb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Value Gap Compensation</h3>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 text-sm mb-4">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Your product value</p>
                      <p className="font-semibold">{yourProduct.estimatedValue.toLocaleString()} EGP</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Other product value</p>
                      <p className="font-semibold">{otherProduct.estimatedValue.toLocaleString()} EGP</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Estimated value gap</p>
                      <p className="font-semibold">{valueGap.toLocaleString()} EGP</p>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground mb-4">
                    Your available coins: <span className="font-semibold text-foreground">{currentUserCoinBalance.toLocaleString()}</span>
                    {currentUserHeldCoins > 0 ? (
                      <span> · Held: <span className="font-semibold text-foreground">{currentUserHeldCoins.toLocaleString()}</span></span>
                    ) : null}
                  </div>

                  {valueGap === 0 ? (
                    <p className="text-sm text-muted-foreground">These products have the same estimated value. Coin compensation is not needed.</p>
                  ) : compensationStatus === 'proposed' && currentUserIsCompensationReceiver ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {compensationProposer.firstName || 'The other participant'} proposed <span className="font-semibold text-foreground">{compensationAmountValue.toLocaleString()} coins</span> as value gap compensation.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          className="flex-1"
                          onClick={() => handleCompensationAction('accept')}
                          loading={processingAction === 'compensation-accept'}
                          disabled={processingAction !== null}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleCompensationAction('reject')}
                          loading={processingAction === 'compensation-reject'}
                          disabled={processingAction !== null}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ) : compensationStatus === 'proposed' && currentUserIsCompensationPayer ? (
                    <p className="text-sm text-muted-foreground">
                      Waiting for the other participant to accept your coin compensation proposal of {compensationAmountValue.toLocaleString()} coins.
                    </p>
                  ) : compensationStatus === 'proposed' ? (
                    <p className="text-sm text-muted-foreground">
                      A coin compensation proposal of {compensationAmountValue.toLocaleString()} coins is pending.
                    </p>
                  ) : compensationStatus === 'held' ? (
                    <p className="text-sm text-green-700">
                      {compensationAmountValue.toLocaleString()} coins are held safely until swap completion.
                    </p>
                  ) : compensationStatus === 'released' ? (
                    <p className="text-sm text-green-700">
                      {compensationAmountValue.toLocaleString()} coins were released after completion.
                    </p>
                  ) : compensationStatus === 'refunded' ? (
                    <p className="text-sm text-muted-foreground">
                      {compensationAmountValue.toLocaleString()} coins were refunded.
                    </p>
                  ) : swap.status === 'in_discussion' && currentUserIsLowerValueOwner ? (
                    <div className="space-y-3">
                      {compensationStatus === 'rejected' && (
                        <p className="text-sm text-muted-foreground">The previous compensation proposal was rejected. The swap can continue normally.</p>
                      )}
                      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={compensationAmount}
                          onChange={event => setCompensationAmount(event.target.value)}
                          placeholder="Coin amount"
                        />
                        <Button
                          onClick={() => handleCompensationAction('propose')}
                          loading={processingAction === 'compensation-propose'}
                          disabled={processingAction !== null}
                        >
                          Propose coin compensation
                        </Button>
                      </div>
                    </div>
                  ) : swap.status === 'in_discussion' ? (
                    <p className="text-sm text-muted-foreground">
                      Only the participant offering the lower-value product can propose coin compensation.
                    </p>
                  ) : compensationStatus === 'rejected' ? (
                    <p className="text-sm text-muted-foreground">The coin compensation proposal was rejected. The swap continued without compensation.</p>
                  ) : null}
                </div>
              )}

              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-border bg-muted/30">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={other.avatar} />
                    <AvatarFallback className="text-xs bg-brand-100 text-brand-700">
                      {other.firstName[0] || '?'}{other.lastName[0] || ''}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{other.firstName} {other.lastName}</p>
                    <p className="text-xs text-muted-foreground">{formatParticipantMetrics(other)}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    <span>Admin monitored</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 p-4 min-h-64 max-h-96 overflow-y-auto">
                  {messagesLoading && (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Loading messages...</p>
                    </div>
                  )}
                  {!messagesLoading && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">No messages yet</p>
                      <p className="text-xs mt-0.5">
                        {canSendMessage ? 'Start the discussion below.' : 'Messaging is unavailable at this stage.'}
                      </p>
                    </div>
                  )}
                  {!messagesLoading && messages.map((message) => {
                    const isSystem = message.type === 'system'
                    const isMine = message.senderId === user.id

                    return (
                      <div key={message.id} className={cn('flex', isSystem ? 'justify-center' : isMine ? 'justify-end' : 'justify-start')}>
                        {isSystem ? (
                          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-full text-xs text-muted-foreground max-w-xs text-center">
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                            {message.content}
                          </div>
                        ) : (
                          <div className={cn('flex items-end gap-2', isMine && 'flex-row-reverse')}>
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage src={message.senderAvatar} />
                              <AvatarFallback className="text-[10px] bg-brand-100 text-brand-700">
                                {message.senderName
                                  ? message.senderName.split(' ').map(part => part[0]).join('').slice(0, 2)
                                  : '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className={cn(
                              'max-w-xs lg:max-w-sm px-4 py-2.5 text-sm leading-relaxed rounded-2xl',
                              isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
                            )}>
                              <p>{message.content}</p>
                              <p className={cn('text-[10px] mt-1', isMine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                                {message.senderName && !isMine ? `${message.senderName} - ` : ''}
                                {format(new Date(message.createdAt), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {canSendMessage ? (
                  <div className="p-4 border-t border-border flex gap-2">
                    <Textarea
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                      placeholder="Type a message..."
                      rows={2}
                      maxLength={1000}
                      className="resize-none flex-1"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          handleSendMessage()
                        }
                      }}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageText.trim() || sendingMessage}
                      loading={sendingMessage}
                      size="icon"
                      className="self-end h-9 w-9"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 border-t border-border text-center text-sm text-muted-foreground">
                    Messaging is unavailable at this stage.
                  </div>
                )}
                {canReportDiscussion && (
                  <div className="px-4 pb-3 flex justify-end">
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Flag className="h-3 w-3" /> Report discussion
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 mt-3">
                {canModerate && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => handleSwapAction('accept')} loading={processingAction === 'accept'} disabled={processingAction !== null}>
                      <Check className="h-4 w-4" /> Accept
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => handleSwapAction('reject')} loading={processingAction === 'reject'} disabled={processingAction !== null}>
                      Reject
                    </Button>
                  </div>
                )}
                {swap.status === 'pending' && isRequester && (
                  <div className="p-3 bg-muted/50 rounded-xl text-center text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 inline mr-1.5" />
                    Waiting for {other.firstName || 'the receiver'} to accept or reject this request.
                  </div>
                )}
                {swap.status === 'pending' && !canModerate && !isRequester && (
                  <div className="p-3 bg-muted/50 rounded-xl text-center text-sm text-muted-foreground">
                    Only the receiver can accept or reject a pending swap.
                  </div>
                )}
                {swap.status === 'in_discussion' && (
                  <>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-center text-sm text-green-700">
                      <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                      This swap has been accepted.
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleSubmitForReview}
                      loading={processingAction === 'submit-review'}
                      disabled={processingAction !== null}
                    >
                      Submit for admin review
                    </Button>
                  </>
                )}
                {(swap.status === 'approved' || swap.status === 'payment_pending') && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-center text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                    This swap has been approved. Service fee payment is available.
                  </div>
                )}
                {canOpenDispute && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setShowDisputeModal(true)}
                  >
                    <AlertTriangle className="h-4 w-4" /> Open a dispute
                  </Button>
                )}
                {canCancelSwap && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setShowCancelModal(true)}
                    disabled={processingAction !== null}
                  >
                    <AlertCircle className="h-4 w-4" /> Cancel swap
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <div className="bg-card rounded-2xl border border-border p-5">
                <h3 className="font-semibold mb-5">Swap timeline</h3>
                <div className="space-y-1">
                  {timeline.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No timeline events yet.
                    </div>
                  )}
                  {timeline.map((event, index) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center gap-0">
                        <div className={[
                          'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                          getTimelineTone(event) === 'success' ? 'bg-green-100 text-green-700' :
                          getTimelineTone(event) === 'danger' ? 'bg-red-100 text-red-700' :
                          'bg-muted text-muted-foreground',
                        ].join(' ')}>
                          {getTimelineTone(event) === 'success' ? <Check className="h-3.5 w-3.5" /> :
                           getTimelineTone(event) === 'danger' ? <AlertCircle className="h-3.5 w-3.5" /> :
                           <Clock className="h-3.5 w-3.5" />}
                        </div>
                        {index < timeline.length - 1 && (
                          <div className="w-px flex-1 min-h-6 bg-border mt-1" />
                        )}
                      </div>
                      <div className="pb-5 flex-1 min-w-0 pt-0.5">
                        <p className="text-sm font-medium">{formatTimelineEventName(event.event)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(event.createdAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="exchange" className="mt-4 space-y-4">
              {canSubmitExchangeProposal && (
                <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
                  <h3 className="font-semibold">
                    {isPlatformDelivery ? 'Submit pickup details' : exchangeProposalStatus === 'changes_requested' ? 'Update exchange method' : 'Choose exchange method'}
                  </h3>
                  {exchangeProposalStatus === 'changes_requested' && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700">
                      Changes were requested. Submit updated details for the other participant to review.
                    </div>
                  )}
                  {exchangeMode === null && !isPlatformDelivery && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <button
                        onClick={() => setExchangeMode('meetup')}
                        className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
                      >
                        <MapPin className="h-8 w-8 text-primary" />
                        <div>
                          <p className="font-semibold">Meet in person</p>
                          <p className="text-xs text-muted-foreground mt-1">Choose a safe public location</p>
                        </div>
                        <Badge variant="approved">Recommended</Badge>
                      </button>
                      <button
                        onClick={() => setExchangeMode('delivery')}
                        className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
                      >
                        <Truck className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-semibold">Delivery</p>
                          <p className="text-xs text-muted-foreground mt-1">Platform courier pickup and delivery</p>
                        </div>
                        <Badge variant="info">Available</Badge>
                      </button>
                    </div>
                  )}

                  {exchangeMode === 'meetup' && (
                    <div className="space-y-4 animate-fade-in">
                      <Button variant="ghost" size="sm" onClick={() => setExchangeMode(null)} className="mb-1">
                        Back
                      </Button>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>City *</Label>
                          <SwapDetailDropdown
                            ariaLabel="Meetup city"
                            value={meetupForm.city}
                            options={[
                              { value: '', label: 'Select city...' },
                              ...CITY_OPTIONS.map(city => ({ value: city, label: city })),
                            ]}
                            onChange={value => setMeetupForm(f => ({ ...f, city: value, area: '', meetingPoint: '' }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Area *</Label>
                          <SwapDetailDropdown
                            ariaLabel="Meetup area"
                            value={meetupForm.area}
                            disabled={!meetupForm.city}
                            options={[
                              { value: '', label: meetupForm.city ? 'Select area...' : 'Select city first' },
                              ...meetupAreaOptions.map(area => ({ value: area.name, label: area.name })),
                            ]}
                            onChange={value => setMeetupForm(f => ({ ...f, area: value, meetingPoint: '' }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Suggested meeting points</Label>
                        <div className="flex flex-wrap gap-2">
                          {meetupMeetingPoints.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              {meetupForm.area ? 'No suggested meeting points for this area.' : 'Select an area to see suggested meeting points.'}
                            </p>
                          )}
                          {meetupMeetingPoints.map(point => (
                            <button
                              key={point}
                              onClick={() => setMeetupForm(f => ({ ...f, meetingPoint: point }))}
                              className={cn(
                                'text-sm px-3 py-1.5 rounded-full border transition-colors',
                                meetupForm.meetingPoint === point
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border hover:bg-muted'
                              )}
                            >
                              {point}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={meetupForm.meetingPoint}
                          onChange={e => setMeetupForm(f => ({ ...f, meetingPoint: e.target.value }))}
                          placeholder="Or enter custom location..."
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Meetup date *</Label>
                          <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="date"
                              value={meetupForm.date}
                              onChange={e => setMeetupForm(f => ({ ...f, date: e.target.value }))}
                              min={todayDate}
                              className="pl-9"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Meetup time *</Label>
                          <div className="relative">
                            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="time"
                              min={SAFE_TIME_MIN}
                              max={SAFE_TIME_MAX}
                              step={SAFE_TIME_STEP_SECONDS}
                              value={meetupForm.time}
                              onChange={e => setMeetupForm(f => ({ ...f, time: e.target.value }))}
                              className="pl-9"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Available from {SAFE_TIME_MIN} to {SAFE_TIME_MAX}.</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Additional notes</Label>
                        <Textarea
                          value={meetupForm.additionalNotes || ''}
                          onChange={e => setMeetupForm(f => ({ ...f, additionalNotes: e.target.value }))}
                          placeholder="Optional details for the meetup..."
                          rows={2}
                        />
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700">
                        <strong>Safety tip:</strong> Always meet in a busy public place during daylight hours. Bring a friend if possible.
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => handleSetExchangeMethod('meetup')}
                        loading={processingAction === 'exchange-method'}
                        disabled={processingAction !== null}
                      >
                        <CalendarDays className="h-4 w-4" /> Propose meetup
                      </Button>
                    </div>
                  )}

                  {(exchangeMode === 'delivery' || (isPlatformDelivery && !currentUserSubmittedDelivery)) && (
                    <div className="space-y-4 animate-fade-in">
                      {!isPlatformDelivery && (
                        <Button variant="ghost" size="sm" onClick={() => setExchangeMode(null)} className="mb-1">
                          Back
                        </Button>
                      )}
                      <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                        <div className="flex items-center gap-2">
                          <Truck className="h-5 w-5 text-blue-600" />
                          <p className="font-semibold text-blue-800">Platform delivery</p>
                        </div>
                        <p className="text-sm text-blue-700">
                          Swap & Save coordinates pickup and delivery through a courier. Delivery fee: 100 EGP cash to courier per user.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2 text-xs text-blue-700">
                          {['Submit your pickup address', 'Courier collects both items', 'Admin manages tracking', 'Confirm completion after delivery'].map(tip => (
                            <div key={tip} className="flex items-center gap-1.5">
                              <Check className="h-3.5 w-3.5 shrink-0" /> {tip}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Pickup address</Label>
                        <Input
                          value={deliveryForm.address}
                          onChange={e => setDeliveryForm(f => ({ ...f, address: e.target.value }))}
                          placeholder="Building, street, nearest landmark..."
                        />
                      </div>
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <Label>Country *</Label>
                          <SwapDetailDropdown
                            ariaLabel="Pickup country"
                            value={deliveryForm.country || EGYPT_COUNTRY}
                            disabled
                            options={[{ value: EGYPT_COUNTRY, label: EGYPT_COUNTRY }]}
                            onChange={() => undefined}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>City *</Label>
                          <SwapDetailDropdown
                            ariaLabel="Pickup city"
                            value={deliveryForm.city}
                            options={[
                              { value: '', label: 'Select city...' },
                              ...CITY_OPTIONS.map(city => ({ value: city, label: city })),
                            ]}
                            onChange={value => setDeliveryForm(f => ({ ...f, city: value, area: '', country: EGYPT_COUNTRY }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Area *</Label>
                          <SwapDetailDropdown
                            ariaLabel="Pickup area"
                            value={deliveryForm.area}
                            disabled={!deliveryForm.city}
                            options={[
                              { value: '', label: deliveryForm.city ? 'Select area...' : 'Select city first' },
                              ...deliveryAreaOptions.map(area => ({ value: area.name, label: area.name })),
                            ]}
                            onChange={value => setDeliveryForm(f => ({ ...f, area: value, country: EGYPT_COUNTRY }))}
                          />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Preferred pickup date *</Label>
                          <div className="relative">
                            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="date"
                              value={deliveryForm.preferredDate}
                              onChange={e => setDeliveryForm(f => ({ ...f, preferredDate: e.target.value }))}
                              min={todayDate}
                              className="pl-9"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Preferred pickup time *</Label>
                          <div className="relative">
                            <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="time"
                              min={SAFE_TIME_MIN}
                              max={SAFE_TIME_MAX}
                              step={SAFE_TIME_STEP_SECONDS}
                              value={deliveryForm.preferredTime}
                              onChange={e => setDeliveryForm(f => ({ ...f, preferredTime: e.target.value }))}
                              className="pl-9"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">Available from {SAFE_TIME_MIN} to {SAFE_TIME_MAX}.</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Pickup notes</Label>
                        <Textarea
                          value={deliveryForm.notes}
                          onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Optional courier instructions..."
                          rows={2}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => handleSetExchangeMethod('delivery')}
                        loading={processingAction === 'exchange-method'}
                        disabled={processingAction !== null}
                      >
                        <Truck className="h-4 w-4" /> Submit pickup details
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {swap.meetupDetails?.meetingPoint && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Meetup details
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Location', value: swap.meetupDetails.meetingPoint },
                      { label: 'City / Area', value: `${swap.meetupDetails.city}, ${swap.meetupDetails.area}` },
                      { label: 'Date', value: swap.meetupDetails.date },
                      { label: 'Time', value: swap.meetupDetails.time },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                        <p className="font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                  {swap.meetupDetails.additionalNotes && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm mt-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                      <p className="font-medium">{swap.meetupDetails.additionalNotes}</p>
                    </div>
                  )}
                </div>
              )}

              {swap.deliveryDetails && !swap.meetupDetails?.meetingPoint && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" /> Platform delivery
                    </h3>
                    <Badge variant={deliveryCompleted ? 'success' : 'secondary'}>
                      {DELIVERY_STATUS_LABELS[deliveryStatus]}
                    </Badge>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
                    <div className={cn(
                      'rounded-lg border p-3',
                      currentUserSubmittedDelivery ? 'bg-green-50 border-green-200 text-green-800' : 'bg-muted/50 border-border'
                    )}>
                      <p className="text-xs mb-0.5 opacity-70">Your pickup details</p>
                      <p className="font-medium">{currentUserSubmittedDelivery ? 'Submitted' : 'Not submitted'}</p>
                    </div>
                    <div className={cn(
                      'rounded-lg border p-3',
                      otherParticipantSubmittedDelivery ? 'bg-green-50 border-green-200 text-green-800' : 'bg-muted/50 border-border'
                    )}>
                      <p className="text-xs mb-0.5 opacity-70">{other.firstName || 'Other participant'}</p>
                      <p className="font-medium">{otherParticipantSubmittedDelivery ? 'Submitted' : 'Not submitted'}</p>
                    </div>
                  </div>
                  {currentDeliveryPickup?.submitted && (
                    <div className="bg-muted/50 rounded-lg p-3 text-sm mb-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Your pickup window</p>
                      <p className="font-medium">{currentDeliveryPickup.preferredDate} at {currentDeliveryPickup.preferredTime}</p>
                      <p className="text-muted-foreground mt-1">{[currentDeliveryPickup.area, currentDeliveryPickup.city, currentDeliveryPickup.country].filter(Boolean).join(', ')}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Delivery fee: {swap.deliveryDetails.feePerUser} EGP cash to courier per user. Admin manages courier tracking.
                  </p>
                </div>
              )}

              {swap.status === 'exchange_setup' && exchangeProposalStatus === 'pending' && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  {currentUserProposedExchange ? (
                    <div className="text-center text-sm text-muted-foreground">
                      <Clock className="h-5 w-5 mx-auto mb-2 text-amber-600" />
                      <p className="font-medium text-foreground">Waiting for the other participant to accept exchange details.</p>
                      <p className="mt-1">The swap will stay in exchange setup until they accept.</p>
                    </div>
                  ) : canAcceptExchangeProposal ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                        Review the proposed exchange details above. Accepting them will move this swap into progress.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          className="flex-1"
                          onClick={handleAcceptExchangeMethod}
                          loading={processingAction === 'exchange-accept'}
                          disabled={processingAction !== null}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Accept exchange details
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={handleRequestExchangeChanges}
                          loading={processingAction === 'exchange-changes'}
                          disabled={processingAction !== null}
                        >
                          Request changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      Exchange details are pending review.
                    </div>
                  )}
                </div>
              )}

              {swap.status === 'in_progress' && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
                  <h3 className="font-semibold mb-2 text-green-900">Confirm completion</h3>
                  <p className="text-sm text-green-700 mb-4">
                    {isPlatformDelivery
                      ? 'Confirm after platform delivery is completed and you have inspected the item.'
                      : 'Only confirm once you have physically received and inspected the item.'}
                    {otherParticipantConfirmed && !currentUserConfirmed && (
                      <span className="font-semibold"> {other.firstName || 'The other participant'} has already confirmed. Waiting for you.</span>
                    )}
                  </p>
                  {isPlatformDelivery && !deliveryCompleted && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                      Current delivery status: <span className="font-semibold">{DELIVERY_STATUS_LABELS[deliveryStatus]}</span>. Completion unlocks when delivery is completed.
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-4 text-sm">
                    <div className={cn(
                      'flex-1 rounded-lg border p-3',
                      currentUserConfirmed ? 'bg-white border-green-300 text-green-700' : 'bg-white/70 border-green-200 text-green-800'
                    )}>
                      <p className="text-xs text-green-700/70">You</p>
                      <p className="font-medium">{currentUserConfirmed ? 'Confirmed' : 'Not confirmed'}</p>
                    </div>
                    <div className={cn(
                      'flex-1 rounded-lg border p-3',
                      otherParticipantConfirmed ? 'bg-white border-green-300 text-green-700' : 'bg-white/70 border-green-200 text-green-800'
                    )}>
                      <p className="text-xs text-green-700/70">{other.firstName || 'Other participant'}</p>
                      <p className="font-medium">{otherParticipantConfirmed ? 'Confirmed' : 'Not confirmed'}</p>
                    </div>
                  </div>
                  {!currentUserConfirmed ? (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleConfirmCompletion}
                      loading={processingAction === 'confirm-completion'}
                      disabled={processingAction !== null || !deliveryCompleted}
                    >
                      <CheckCircle2 className="h-4 w-4" /> {deliveryCompleted ? 'I received the item - confirm complete' : 'Waiting for delivery completion'}
                    </Button>
                  ) : (
                    <p className="text-sm text-center text-green-700 font-medium">
                      You confirmed. Waiting for {other.firstName || 'the other participant'}.
                    </p>
                  )}
                </div>
              )}

              {swap.status === 'completed' && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-3" />
                  <h3 className="font-semibold text-green-900">Swap completed!</h3>
                  <p className="text-sm text-green-700 mt-1 mb-4">
                    {currentUserRating
                      ? 'Thank you for rating your experience!'
                      : `Don't forget to rate your experience with ${other.firstName || 'the other participant'}.`}
                  </p>
                  {!currentUserRating && (
                    <Button
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={() => setActiveTab('rating')}
                    >
                      <Star className="h-4 w-4" /> Leave a rating
                    </Button>
                  )}
                </div>
              )}

              {!['exchange_setup', 'in_progress', 'completed'].includes(swap.status) && !swap.meetupDetails?.meetingPoint && !swap.deliveryDetails && (
                <div className="bg-card rounded-2xl border border-border p-5 text-sm text-muted-foreground">
                  Exchange setup becomes available after both service fees are paid.
                </div>
              )}

              {swap.status === 'in_progress' && isPlatformDelivery && swap.deliveryDetails && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" /> Delivery tracking
                  </h3>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Current status</p>
                      <p className="text-sm font-semibold">{DELIVERY_STATUS_LABELS[deliveryStatus]}</p>
                    </div>
                    <Badge variant={deliveryCompleted ? 'success' : 'info'}>
                      {deliveryCompleted ? 'Ready to confirm' : 'In delivery'}
                    </Badge>
                  </div>
                  <div className="grid sm:grid-cols-5 gap-2 text-xs mb-4">
                    {DELIVERY_TIMELINE_STEPS.map((step, index) => {
                      const done = index <= deliveryTimelineIndex

                      return (
                        <div
                          key={step.status}
                          className={cn(
                            'rounded-lg border p-2 flex items-center gap-1.5',
                            done ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-muted/40 border-border text-muted-foreground'
                          )}
                        >
                          {done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
                          <span className="font-medium">{step.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Requester item picked up', done: swap.deliveryDetails.tracking.requesterItemPickedUp },
                      { label: 'Receiver item picked up', done: swap.deliveryDetails.tracking.receiverItemPickedUp },
                      { label: 'Delivered to requester', done: swap.deliveryDetails.tracking.deliveredToRequester },
                      { label: 'Delivered to receiver', done: swap.deliveryDetails.tracking.deliveredToReceiver },
                    ].map(step => (
                      <div
                        key={step.label}
                        className={cn(
                          'rounded-lg border p-3 flex items-center gap-2',
                          step.done ? 'bg-green-50 border-green-200 text-green-800' : 'bg-muted/50 border-border text-muted-foreground'
                        )}
                      >
                        {step.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        <span className="font-medium">{step.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Delivery is managed by the platform. Confirm completion only after your item arrives and passes inspection.
                  </p>
                </div>
              )}
            </TabsContent>

            {swap.status === 'completed' && (
              <TabsContent value="rating" className="mt-4">
                <div className="bg-card rounded-2xl border border-border p-5">
                  {ratingsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Loading ratings...</p>
                    </div>
                  ) : currentUserRating ? (
                    <div className="text-center py-8">
                      <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                      <p className="font-semibold">Rating submitted!</p>
                      <div className="flex justify-center gap-1 my-3">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <Star
                            key={score}
                            className={cn(
                              'h-5 w-5',
                              score <= currentUserRating.score ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                            )}
                          />
                        ))}
                      </div>
                      {currentUserRating.tags.length > 0 && (
                        <div className="flex justify-center flex-wrap gap-2 mb-3">
                          {currentUserRating.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="capitalize">
                              {tag.replace('-', ' ')}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {currentUserRating.comment && (
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">{currentUserRating.comment}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <h3 className="font-semibold">Rate {other.firstName || 'the other participant'}</h3>
                      <div className="flex justify-center gap-3">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            type="button"
                            onClick={() => setRatingScore(score)}
                            className="transition-all hover:scale-110"
                          >
                            <Star
                              className={cn(
                                'h-9 w-9',
                                score <= ratingScore ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'
                              )}
                            />
                          </button>
                        ))}
                      </div>
                      {ratingScore > 0 && (
                        <p className="text-center text-sm font-medium text-muted-foreground">
                          {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'][ratingScore]}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        <Label>Tags (select all that apply)</Label>
                        <div className="flex flex-wrap gap-2">
                          {RATING_TAGS.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setRatingTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}
                              className={cn(
                                'text-sm px-3 py-1.5 rounded-full border capitalize transition-colors',
                                ratingTags.includes(tag)
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'border-border hover:bg-muted'
                              )}
                            >
                              {tag.replace('-', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Comment <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Textarea
                          value={ratingComment}
                          onChange={event => setRatingComment(event.target.value)}
                          placeholder={`Tell others about your experience with ${other.firstName || 'this user'}...`}
                          rows={3}
                          maxLength={1000}
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleSubmitRating}
                        disabled={!ratingScore || submittingRating}
                        loading={submittingRating}
                      >
                        Submit rating
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Products</p>
            {[
              { label: isRequester ? 'You offer' : 'They offer', product: offeredProduct },
              { label: isRequester ? 'You want' : 'They want', product: requestedProduct },
            ].map(({ label, product }) => (
              <div key={label} className="flex items-center gap-3 mb-3 last:mb-0">
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                  {product.images[0] && <img src={product.images[0]} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium truncate">{product.title}</p>
                  <p className="text-xs text-primary font-semibold">~{product.estimatedValue.toLocaleString()} EGP</p>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border text-xs text-muted-foreground flex justify-between">
              <span>Value gap</span>
              <span className="font-medium">
                {Math.abs(offeredProduct.estimatedValue - requestedProduct.estimatedValue).toLocaleString()} EGP
              </span>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Service fee</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Each participant pays a fixed {currentUserFee.toLocaleString()} EGP platform service fee. This helps cover admin review, safe swap handling, support, and dispute resolution.
            </p>
            {showServiceFeeStatus ? (
              <>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Your fee</span>
                    <span className="font-semibold">{currentUserFee.toLocaleString()} EGP</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">You</span>
                    <span className={currentUserPaid ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                      {currentUserPaid ? 'Paid' : 'Not paid'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{other.firstName || 'Other participant'}</span>
                    <span className={otherParticipantPaid ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                      {otherParticipantPaid ? 'Paid' : 'Not paid'}
                    </span>
                  </div>
                </div>
                {canContinueServiceFee ? (
                  <div className="mt-3 space-y-2">
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleContinueServiceFeePayment}
                      loading={processingAction === 'pay-service-fee'}
                      disabled={processingAction !== null}
                    >
                      Continue payment
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      size="sm"
                      onClick={handleCheckServiceFeeStatus}
                      loading={processingAction === 'check-service-fee'}
                      disabled={processingAction !== null}
                    >
                      Check payment status
                    </Button>
                  </div>
                ) : canRetryServiceFee ? (
                  <div className="mt-3 space-y-2">
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handlePayServiceFee}
                      loading={processingAction === 'pay-service-fee'}
                      disabled={processingAction !== null}
                    >
                      Try payment again
                    </Button>
                    {currentUserServiceFeePending ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        size="sm"
                        onClick={handleCheckServiceFeeStatus}
                        loading={processingAction === 'check-service-fee'}
                        disabled={processingAction !== null}
                      >
                        Check payment status
                      </Button>
                    ) : null}
                  </div>
                ) : !currentUserPaid && canPayServiceFee ? (
                  <Button
                    className="w-full mt-3"
                    size="sm"
                    onClick={handlePayServiceFee}
                    loading={processingAction === 'pay-service-fee'}
                    disabled={processingAction !== null}
                  >
                    Pay service fee
                  </Button>
                ) : currentUserPaid && !otherParticipantPaid ? (
                  <Button className="w-full mt-3" size="sm" disabled>
                    Paid - waiting for other participant
                  </Button>
                ) : currentUserPaid && otherParticipantPaid ? (
                  <Button className="w-full mt-3" size="sm" disabled>
                    Service Fee Paid
                  </Button>
                ) : (
                  <Button className="w-full mt-3" size="sm" disabled>
                    Payment unavailable
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Service fee payment becomes available after admin approval.
                </p>
                <Button className="w-full mt-3" size="sm" disabled>
                  Locked
                </Button>
              </>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={other.avatar} />
                <AvatarFallback className="text-xs bg-brand-100 text-brand-700">
                  {other.firstName[0] || '?'}{other.lastName[0] || ''}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{other.firstName} {other.lastName}</p>
                <p className="text-xs text-muted-foreground">{formatParticipantMetrics(other)}</p>
              </div>
            </div>
            <Link href={`/users/${encodeURIComponent(other.id)}`} className="text-xs text-primary hover:underline mt-2 block">
              View public profile
            </Link>
          </div>

          <div className="bg-muted/50 rounded-xl p-4 flex items-start gap-3">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Products remain reserved until both participants confirm completion. Ratings become available after the swap is complete.
            </p>
          </div>
        </div>
      </div>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this swap?</DialogTitle>
            <DialogDescription>
              This will cancel the swap. Reserved products will be released back to Marketplace if no other active swap still needs them. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700">
              Cancel only if you no longer want to continue. Any unpaid pending service-fee checkout for this swap will no longer be usable.
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCancelModal(false)}
                disabled={processingAction === 'cancel'}
              >
                Keep swap
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancelSwap}
                loading={processingAction === 'cancel'}
                disabled={processingAction !== null}
              >
                Cancel swap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisputeModal} onOpenChange={setShowDisputeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open a dispute</DialogTitle>
            <DialogDescription>Our admin team will review and mediate within 48 hours.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <SwapDetailDropdown
                ariaLabel="Dispute reason"
                value={disputeReason}
                options={[
                  { value: '', label: 'Select reason...' },
                  { value: 'Item not as described', label: 'Item not as described' },
                  { value: 'Item not received', label: 'Item not received' },
                  { value: 'Item damaged', label: 'Item damaged in transit' },
                  { value: 'Wrong item received', label: 'Wrong item received' },
                  { value: 'Other', label: 'Other' },
                ]}
                onChange={setDisputeReason}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea
                value={disputeDescription}
                onChange={event => setDisputeDescription(event.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
                maxLength={2000}
              />
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700">
              Opening a dispute will pause the swap and notify the admin team. Only use this if you have a genuine issue.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDisputeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleOpenDispute}
                loading={submittingReport}
                disabled={!disputeReason || !disputeDescription.trim() || submittingReport}
              >
                Open dispute
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report discussion</DialogTitle>
            <DialogDescription>Flag this swap discussion to our admin team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <SwapDetailDropdown
                ariaLabel="Report reason"
                value={reportReason}
                options={[
                  { value: '', label: 'Select reason...' },
                  { value: 'Sharing contact details', label: 'Sharing personal contact details' },
                  { value: 'Harassment', label: 'Harassment or threatening behaviour' },
                  { value: 'Fraud attempt', label: 'Suspected fraud attempt' },
                  { value: 'Inappropriate content', label: 'Inappropriate content' },
                  { value: 'Platform bypass', label: 'Attempting to bypass platform' },
                  { value: 'Other', label: 'Other' },
                ]}
                onChange={setReportReason}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowReportModal(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleSubmitReport}
                loading={submittingReport}
                disabled={!reportReason || submittingReport}
              >
                <Flag className="h-4 w-4" /> Submit report
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
