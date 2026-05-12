'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftRight, Package, Plus, ChevronRight, Star, ShieldCheck,
  CheckCircle2, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/primitives'
import { StatsCard } from '@/components/shared/stats-card'
import { SwapStatusBadge } from '@/components/shared/status-badges'
import { ProductCard } from '@/components/shared/product-card'
import { mapNotification, markNotificationRead } from '@/lib/notifications-api'
import { API_BASE_URL as API_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import type { DeliveryLifecycleStatus, ExchangeMethod, MeetupDetails, DeliveryDetails, Notification, Product, ProductCondition, ProductStatus, SwapRequest, SwapStatus, SwapTimelineEvent, TrustLevel, User } from '@/types'

type BackendRecord = Record<string, unknown>

const getSafeNotificationTarget = (notification: Notification) => {
  const target = notification.actionUrl || notification.targetUrl || ''

  if (target.startsWith('/') && !target.startsWith('//')) {
    return target
  }

  return '/user/notifications'
}

const getId = (value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    const record = value as BackendRecord
    return String(record._id ?? record.id ?? '')
  }

  return String(value ?? '')
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
    case 'rejected':
      return 'rejected'
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

const getNumber = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }

  return 0
}

const getBoolean = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'boolean') return value
  }

  return false
}

const hasBackendValue = (item: BackendRecord, ...keys: string[]) =>
  keys.some((key) => item[key] !== undefined && item[key] !== null)

const getString = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }

  return undefined
}

const normalizeExchangeMethod = (method: unknown): ExchangeMethod | undefined =>
  method === 'meetup' || method === 'delivery' ? method : undefined

const mapTimelineEvent = (item: BackendRecord, swapId: string): SwapTimelineEvent => {
  const actor = item.actor === 'requester' || item.actor === 'receiver' || item.actor === 'admin'
    ? item.actor
    : 'system'

  return {
    id: String(item._id ?? item.id ?? ''),
    swapId: getId(item.swap ?? item.swapId) || swapId,
    event: typeof item.event === 'string' ? item.event : '',
    description: typeof item.description === 'string' ? item.description : '',
    actor,
    actorId: getId(item.actor_id ?? item.actorId) || undefined,
    createdAt: getString(item, 'createdAt', 'created_at') ?? new Date().toISOString(),
  }
}

const mapTimeline = (item: BackendRecord, swapId: string) => {
  const timeline = item.timeline ?? item.events

  return Array.isArray(timeline)
    ? timeline
        .filter((event): event is BackendRecord => typeof event === 'object' && event !== null)
        .map((event) => mapTimelineEvent(event, swapId))
    : []
}

const getRecord = (value: unknown) =>
  typeof value === 'object' && value !== null ? value as BackendRecord : undefined

const mapMeetupDetails = (value: unknown): MeetupDetails | undefined => {
  const item = getRecord(value)
  if (!item) return undefined

  return {
    city: getString(item, 'city') ?? '',
    area: getString(item, 'area') ?? '',
    meetingPoint: getString(item, 'meetingPoint', 'meeting_point') ?? '',
    date: getString(item, 'date') ?? '',
    time: getString(item, 'time') ?? '',
    additionalNotes: getString(item, 'additionalNotes', 'additional_notes'),
  }
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

const mapDeliveryDetails = (value: unknown): DeliveryDetails | undefined => {
  const item = getRecord(value)
  if (!item) return undefined

  const requesterPickupRaw = getRecord(item.requester_pickup ?? item.requesterPickup) ?? {}
  const receiverPickupRaw = getRecord(item.receiver_pickup ?? item.receiverPickup) ?? {}
  const trackingRaw = getRecord(item.tracking) ?? {}

  const mapPickup = (pickup: BackendRecord) => ({
    address: getString(pickup, 'address') ?? '',
    country: getString(pickup, 'country') ?? '',
    city: getString(pickup, 'city') ?? '',
    area: getString(pickup, 'area') ?? '',
    preferredDate: getString(pickup, 'preferredDate', 'preferred_date') ?? '',
    preferredTime: getString(pickup, 'preferredTime', 'preferred_time') ?? '',
    notes: getString(pickup, 'notes'),
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

  if (
    !requesterPickup.submitted &&
    !receiverPickup.submitted &&
    !requesterPickup.address &&
    !receiverPickup.address &&
    !tracking.requesterItemPickedUp &&
    !tracking.receiverItemPickedUp &&
    !tracking.deliveredToRequester &&
    !tracking.deliveredToReceiver
  ) return undefined

  return {
    requesterPickup,
    receiverPickup,
    feePerUser: getNumber(item, 'feePerUser', 'fee_per_user') || 100,
    paymentMethod: 'cash_to_courier',
    deliveryStatus: normalizeDeliveryStatus(item.deliveryStatus ?? item.delivery_status),
    tracking,
  }
}

const mapUser = (item: BackendRecord): User => {
  const profileCompleteness = getNumber(item, 'profileCompleteness', 'profile_completeness')
  const trustScore = getNumber(item, 'trustScore', 'trust_score')

  return {
    id: String(item._id ?? item.id ?? ''),
    firstName: typeof item.first_name === 'string' ? item.first_name : typeof item.firstName === 'string' ? item.firstName : '',
    lastName: typeof item.last_name === 'string' ? item.last_name : typeof item.lastName === 'string' ? item.lastName : '',
    email: typeof item.email === 'string' ? item.email : '',
    phone: typeof item.phone === 'string' ? item.phone : undefined,
    avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
    country: typeof item.country === 'string' ? item.country : '',
    city: typeof item.city === 'string' ? item.city : '',
    area: typeof item.area === 'string' ? item.area : '',
    streetAddress: getString(item, 'street_address', 'streetAddress'),
    bio: typeof item.bio === 'string' ? item.bio : undefined,
    joinedAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    isEmailVerified: Boolean(item.isEmailVerified ?? item.is_email_verified),
    isPhoneVerified: Boolean(item.isPhoneVerified ?? item.is_phone_verified),
    isAdmin: Boolean(item.role === 'admin' || item.isAdmin),
    trustLevel: (trustScore >= 70 ? 'trusted' : trustScore < 30 ? 'risky' : 'new') as TrustLevel,
    trustScore,
    completedSwaps: Number(item.completedSwaps ?? item.completed_swaps ?? 0),
    totalSwaps: Number(item.totalSwaps ?? item.total_swaps ?? 0),
    rating: Number(item.rating ?? 0),
    ratingCount: Number(item.ratingCount ?? item.rating_count ?? 0),
    coinBalance: Number(item.coinBalance ?? item.coin_balance ?? 0),
    featuredSlotsUsed: Number(item.featuredSlotsUsed ?? item.featured_slots_used ?? 0),
    profileCompleteness,
    isSuspended: Boolean(item.isSuspended ?? item.is_suspended),
    suspendedReason: typeof item.suspendedReason === 'string' ? item.suspendedReason : undefined,
    lastActiveAt: typeof item.lastActiveAt === 'string' ? item.lastActiveAt : new Date().toISOString(),
  }
}

const mapProduct = (item: BackendRecord): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId: getId(item.owner_id ?? item.ownerId),
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

const getBackendItems = (data: unknown, key: string) =>
  typeof data === 'object' &&
  data !== null &&
  key in data &&
  Array.isArray((data as BackendRecord)[key])
    ? ((data as BackendRecord)[key] as unknown[])
    : []

const fetchJson = async (url: string, token: string) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : 'Failed to load dashboard.'

    const error = new Error(message)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }

  return data
}

export default function UserDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [myProducts, setMyProducts] = useState<Product[]>([])
  const [mySwaps, setMySwaps] = useState<SwapRequest[]>([])
  const [swapUsers, setSwapUsers] = useState<Record<string, User>>({})
  const [swapProducts, setSwapProducts] = useState<Record<string, Product>>({})
  const [savedCount, setSavedCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [recommendations, setRecommendations] = useState<Array<{ product: Product; score: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const redirectToLogin = () => {
      localStorage.removeItem('token')
      router.push('/login')
    }

    const loadDashboard = async () => {
      const token = localStorage.getItem('token') || ''

      if (!token) {
        redirectToLogin()
        return
      }

      try {
        setLoading(true)

        const [meData, productsData, savedData, swapsData, notificationsData] = await Promise.all([
          fetchJson(`${API_URL}/users/me`, token),
          fetchJson(`${API_URL}/products/mine`, token),
          fetchJson(`${API_URL}/products/saved`, token),
          fetchJson(`${API_URL}/swaps`, token),
          fetchJson(`${API_URL}/notifications`, token),
        ])

        const authUserRaw =
          typeof meData === 'object' &&
          meData !== null &&
          'user' in meData &&
          typeof meData.user === 'object' &&
          meData.user !== null
            ? meData.user as BackendRecord
            : null

        const authUser =
          authUserRaw
            ? mapUser(authUserRaw)
            : null

        if (!authUser || !authUserRaw) {
          throw new Error('Could not load your profile.')
        }

        const products = getBackendItems(productsData, 'products')
          .filter((item): item is BackendRecord => typeof item === 'object' && item !== null)
          .map(mapProduct)

        const savedProducts = getBackendItems(savedData, 'products')
        const notificationItems = getBackendItems(notificationsData, 'notifications')
          .filter((item): item is BackendRecord => typeof item === 'object' && item !== null)
          .map(mapNotification)
        const usersById: Record<string, User> = {}
        const productsById: Record<string, Product> = {}

        const swaps = getBackendItems(swapsData, 'swaps').flatMap((item) => {
          if (typeof item !== 'object' || item === null) return []

          const swapItem = item as BackendRecord
          const requesterRaw = typeof swapItem.requester === 'object' && swapItem.requester !== null ? swapItem.requester as BackendRecord : null
          const receiverRaw = typeof swapItem.receiver === 'object' && swapItem.receiver !== null ? swapItem.receiver as BackendRecord : null
          const offeredProductRaw = typeof swapItem.product_offered === 'object' && swapItem.product_offered !== null ? swapItem.product_offered as BackendRecord : null
          const requestedProductRaw = typeof swapItem.product_requested === 'object' && swapItem.product_requested !== null ? swapItem.product_requested as BackendRecord : null

          if (!requesterRaw || !receiverRaw || !offeredProductRaw || !requestedProductRaw) {
            return []
          }

          const requester = mapUser(requesterRaw)
          const receiver = mapUser(receiverRaw)
          const offeredProduct = mapProduct(offeredProductRaw)
          const requestedProduct = mapProduct(requestedProductRaw)

          usersById[requester.id] = requester
          usersById[receiver.id] = receiver
          productsById[offeredProduct.id] = offeredProduct
          productsById[requestedProduct.id] = requestedProduct

          const swapId = String(swapItem._id ?? swapItem.id ?? '')

          return [{
            id: swapId,
            requesterId: requester.id,
            receiverId: receiver.id,
            offeredProductId: offeredProduct.id,
            requestedProductId: requestedProduct.id,
            status: normalizeSwapStatus(swapItem.status),
            message: getString(swapItem, 'message') ?? '',
            adminNotes: getString(swapItem, 'adminNotes', 'admin_notes'),
            adminReviewedBy: getId(swapItem.adminReviewedBy ?? swapItem.admin_reviewed_by) || undefined,
            adminReviewedAt: getString(swapItem, 'adminReviewedAt', 'admin_reviewed_at'),
            serviceFeeRequester: getNumber(swapItem, 'serviceFeeRequester', 'service_fee_requester'),
            serviceFeeReceiver: getNumber(swapItem, 'serviceFeeReceiver', 'service_fee_receiver'),
            requesterPaid: getBoolean(swapItem, 'requesterPaid', 'requester_paid'),
            receiverPaid: getBoolean(swapItem, 'receiverPaid', 'receiver_paid'),
            exchangeMethod: normalizeExchangeMethod(swapItem.exchangeMethod ?? swapItem.exchange_method),
            meetupDetails: mapMeetupDetails(swapItem.meetupDetails ?? swapItem.meetup_details),
            deliveryDetails: mapDeliveryDetails(swapItem.deliveryDetails ?? swapItem.delivery_details),
            requesterConfirmed: getBoolean(swapItem, 'requesterConfirmed', 'requester_confirmed'),
            receiverConfirmed: getBoolean(swapItem, 'receiverConfirmed', 'receiver_confirmed'),
            requesterRatingId: getId(swapItem.requesterRatingId ?? swapItem.requester_rating_id) || undefined,
            receiverRatingId: getId(swapItem.receiverRatingId ?? swapItem.receiver_rating_id) || undefined,
            createdAt: getString(swapItem, 'createdAt', 'created_at') ?? new Date().toISOString(),
            updatedAt: getString(swapItem, 'updatedAt', 'updated_at') ?? new Date().toISOString(),
            timeline: mapTimeline(swapItem, swapId),
          }]
        })

        const activeProduct = products.find((product) => product.status === 'active')
        let realRecommendations: Array<{ product: Product; score: number }> = []

        if (activeProduct) {
          try {
            const recommendationsData = await fetchJson(`${API_URL}/products/recommendations/${activeProduct.id}`, token)
            realRecommendations = getBackendItems(recommendationsData, 'recommendations').flatMap((item) => {
              if (typeof item !== 'object' || item === null) return []

              const recommendation = item as BackendRecord
              const productRaw = typeof recommendation.product === 'object' && recommendation.product !== null
                ? recommendation.product as BackendRecord
                : null

              if (!productRaw) return []

              return [{
                product: mapProduct(productRaw),
                score: Number(recommendation.score ?? 0),
              }]
            })
          } catch {
            realRecommendations = []
          }
        }

        if (!cancelled) {
          const derivedCompletedSwaps = swaps.filter((swap) => swap.status === 'completed').length
          const derivedTotalSwaps = swaps.length

          setUser({
            ...authUser,
            totalSwaps: hasBackendValue(authUserRaw, 'totalSwaps', 'total_swaps') ? authUser.totalSwaps : derivedTotalSwaps,
            completedSwaps: hasBackendValue(authUserRaw, 'completedSwaps', 'completed_swaps') ? authUser.completedSwaps : derivedCompletedSwaps,
          })
          setMyProducts(products)
          setMySwaps(swaps)
          setSwapUsers(usersById)
          setSwapProducts(productsById)
          setSavedCount(savedProducts.length)
          setNotifications(notificationItems)
          setRecommendations(realRecommendations)
        }
      } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (status === 401 || status === 403) {
          redirectToLogin()
          return
        }

        if (!cancelled) {
          setUser(null)
          setMyProducts([])
          setMySwaps([])
          setSwapUsers({})
          setSwapProducts({})
          setSavedCount(0)
          setNotifications([])
          setRecommendations([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      cancelled = true
    }
  }, [router])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center text-sm text-muted-foreground">
        Loading dashboard...
      </div>
    )
  }

  if (!user) {
    return null
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      try {
        const { notification: updatedNotification } = await markNotificationRead(notification.id)
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id
              ? updatedNotification || { ...item, isRead: true }
              : item
          )
        )
      } catch {
        // Keep navigation available even if the read update needs the next refresh.
      }
    }

    router.push(getSafeNotificationTarget(notification))
  }

  const unreadNotifications = notifications.filter(n => !n.isRead).slice(0, 3)
  const activeProducts = myProducts.filter(p => p.status === 'active')
  const pendingSwaps = mySwaps.filter(s => s.status === 'pending')
  const discussionSwaps = mySwaps.filter(s => s.status === 'in_discussion')
  const recentSwaps = [...mySwaps]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4)

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Good day, {user.firstName}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Here's what's happening with your swaps
          </p>
        </div>
        <Button asChild>
          <Link href="/user/products/new">
            <Plus className="h-4 w-4" /> Add product
          </Link>
        </Button>
      </div>

      {/* Action alerts */}
      {discussionSwaps.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              {discussionSwaps.length} swap{discussionSwaps.length > 1 ? 's' : ''} in discussion
            </p>
            <p className="text-xs text-green-600 mt-0.5">Open the swap details to coordinate the next step.</p>
          </div>
          <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 text-white shrink-0">
            <Link href="/user/swaps">View now</Link>
          </Button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active products"
          value={activeProducts.length}
          subtitle={`${myProducts.length} total listings`}
          icon={Package}
          color="blue"
        />
        <StatsCard
          title="Total swaps"
          value={user.totalSwaps}
          subtitle={`${user.completedSwaps} completed`}
          icon={ArrowLeftRight}
          color="green"
        />
        <StatsCard
          title="Pending swaps"
          value={pendingSwaps.length}
          subtitle={`${discussionSwaps.length} in discussion`}
          icon={ShieldCheck}
          color="amber"
        />
        <StatsCard
          title="Saved items"
          value={savedCount}
          subtitle="From your favorites"
          icon={Star}
          color="amber"
        />
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent swaps */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent swaps</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/user/swaps">View all <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>

          {recentSwaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-muted/40 rounded-xl border border-dashed border-border">
              <ArrowLeftRight className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No swap activity yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Browse the marketplace to find your first swap</p>
              <Button asChild size="sm" variant="outline">
                <Link href="/marketplace">Browse products</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSwaps.map(swap => {
                const isRequester = swap.requesterId === user.id
                const other = swapUsers[isRequester ? swap.receiverId : swap.requesterId]
                const myProduct = swapProducts[isRequester ? swap.offeredProductId : swap.requestedProductId]
                const theirProduct = swapProducts[isRequester ? swap.requestedProductId : swap.offeredProductId]

                return (
                  <Link
                    key={swap.id}
                    href={`/user/swaps/${swap.id}`}
                    className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-card transition-all"
                  >
                    {/* Products */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted shrink-0">
                        {myProduct?.images[0] && <img src={myProduct.images[0]} className="h-full w-full object-cover" alt="" />}
                      </div>
                      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted shrink-0">
                        {theirProduct?.images[0] && <img src={theirProduct.images[0]} className="h-full w-full object-cover" alt="" />}
                      </div>
                      <div className="min-w-0 ml-1">
                        <p className="text-sm font-medium truncate">{theirProduct?.title || 'Swap product'}</p>
                        <p className="text-xs text-muted-foreground">with {other?.firstName || 'Swap partner'}</p>
                      </div>
                    </div>
                    <SwapStatusBadge status={swap.status} />
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Trust & profile card */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4">Trust & profile</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Trust score</span>
                  <span className="font-semibold">{user.trustScore}/100</span>
                </div>
                <Progress value={user.trustScore} className="h-2" />
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className={cn('flex items-center gap-1 text-xs font-medium', user.isEmailVerified ? 'text-green-600' : 'text-amber-600')}>
                  {user.isEmailVerified ? <><CheckCircle2 className="h-3.5 w-3.5" />Verified</> : <>Unverified</>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className={cn('flex items-center gap-1 text-xs font-medium', user.isPhoneVerified ? 'text-green-600' : 'text-amber-600')}>
                  {user.isPhoneVerified ? <><CheckCircle2 className="h-3.5 w-3.5" />Verified</> : <>Unverified</>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rating</span>
                <span className="flex items-center gap-1 text-xs font-medium">
                  {user.ratingCount > 0 && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                  {user.ratingCount > 0 ? user.rating.toFixed(1) : 'No ratings yet'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Profile</span>
                <span className="text-xs text-primary font-medium">{user.profileCompleteness}% complete</span>
              </div>
            </div>
            {user.profileCompleteness < 100 && (
              <Button asChild variant="outline" size="sm" className="w-full mt-4">
                <Link href="/user/settings">Complete profile</Link>
              </Button>
            )}
            {user.profileCompleteness >= 100 && (
              <Button type="button" variant="outline" size="sm" className="w-full mt-4" disabled>
                Profile complete
              </Button>
            )}
          </div>

          {/* Unread notifications */}
          {unreadNotifications.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Notifications</h3>
                <Link href="/user/notifications" className="text-xs text-primary hover:underline">View all</Link>
              </div>
              <div className="space-y-2.5">
                {unreadNotifications.map(n => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      void handleNotificationClick(n)
                    }}
                    className="flex w-full cursor-pointer appearance-none items-start gap-2.5 border-0 bg-transparent p-0 text-left group"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                    <div>
                      <p className="text-xs font-medium group-hover:text-primary transition-colors">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{n.body}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI recommendation teaser */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h3 className="font-semibold text-sm text-purple-800">AI Match</h3>
            </div>
            {recommendations.slice(0, 1).map(rec => (
              <div key={rec.product.id} className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-white shrink-0">
                  {rec.product.images[0] && <img src={rec.product.images[0]} className="h-full w-full object-cover" alt="" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{rec.product.title}</p>
                  <p className="text-xs text-purple-600 font-semibold">{rec.score}% match</p>
                </div>
              </div>
            ))}
            <Button asChild size="sm" className="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white">
              <Link href="/user/recommendations">See all matches</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* My products */}
      {myProducts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">My products</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/user/products">Manage all <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {myProducts.slice(0, 4).map(product => (
              <ProductCard key={product.id} product={product} currentUserId={user?.id} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
