'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight, ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form-elements'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import { SwapCard } from '@/components/shared/swap-card'
import { useApp } from '@/contexts/app-context'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { DeliveryDetails, DeliveryLifecycleStatus, ExchangeMethod, Product, ProductCondition, ProductStatus, SwapRequest, SwapStatus, TrustLevel, User } from '@/types'

const STATUS_FILTERS: { value: SwapStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_discussion', label: 'In Discussion' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'payment_pending', label: 'Payment Pending' },
  { value: 'exchange_setup', label: 'Exchange Setup' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' },
]

const QUICK_STATUS_FILTERS = STATUS_FILTERS.slice(0, 5)
const MORE_STATUS_FILTERS = STATUS_FILTERS.slice(5)

const normalizeDeliveryStatus = (status: unknown): DeliveryLifecycleStatus | undefined => {
  if (
    status === 'pending_pickup' ||
    status === 'picked_up' ||
    status === 'in_transit' ||
    status === 'delivered_to_receiver' ||
    status === 'delivery_completed'
  ) {
    return status
  }

  return undefined
}

const getBoolean = (item: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return value.toLowerCase() === 'true'
  }

  return false
}

const getNumber = (item: Record<string, unknown>, ...keys: string[]) => {
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

const trustLevelFromScore = (score: number, isSuspended = false): TrustLevel => {
  if (isSuspended) return 'risky'
  if (score >= 70) return 'trusted'
  if (score < 35) return 'risky'
  return 'new'
}

const mapDeliveryDetails = (details: unknown): DeliveryDetails | undefined => {
  if (typeof details !== 'object' || details === null) return undefined

  const item = details as Record<string, unknown>
  const trackingRaw =
    typeof item.tracking === 'object' && item.tracking !== null
      ? item.tracking as Record<string, unknown>
      : {}
  const deliveryStatus = normalizeDeliveryStatus(item.delivery_status ?? item.deliveryStatus)

  if (!deliveryStatus) return undefined

  const emptyPickup = {
    address: '',
    country: '',
    city: '',
    area: '',
    preferredDate: '',
    preferredTime: '',
    notes: undefined,
    submitted: false,
  }

  return {
    requesterPickup: emptyPickup,
    receiverPickup: emptyPickup,
    feePerUser: Number(item.fee_per_user ?? item.feePerUser ?? 100),
    paymentMethod: 'cash_to_courier',
    deliveryStatus,
    tracking: {
      requesterItemPickedUp: getBoolean(trackingRaw, 'requester_item_picked_up', 'requesterItemPickedUp'),
      receiverItemPickedUp: getBoolean(trackingRaw, 'receiver_item_picked_up', 'receiverItemPickedUp'),
      deliveredToRequester: getBoolean(trackingRaw, 'delivered_to_requester', 'deliveredToRequester'),
      deliveredToReceiver: getBoolean(trackingRaw, 'delivered_to_receiver', 'deliveredToReceiver'),
    },
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

const normalizeExchangeMethod = (method: unknown): ExchangeMethod | undefined =>
  method === 'meetup' || method === 'delivery' ? method : undefined

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

const mapUser = (item: Record<string, unknown>): User => {
  const trustScore = getNumber(item, 'trust_score', 'trustScore')
  const completedSwaps = getNumber(item, 'completed_swaps', 'completedSwaps')
  const totalSwaps = getNumber(item, 'total_swaps', 'totalSwaps') || completedSwaps
  const isSuspended = getBoolean(item, 'is_suspended', 'isSuspended')

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
    streetAddress: undefined,
    bio: typeof item.bio === 'string' ? item.bio : undefined,
    joinedAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    isEmailVerified: getBoolean(item, 'isEmailVerified', 'is_email_verified'),
    isPhoneVerified: getBoolean(item, 'isPhoneVerified', 'is_phone_verified'),
    isAdmin: Boolean(item.role === 'admin' || item.isAdmin),
    trustLevel: trustLevelFromScore(trustScore, isSuspended),
    trustScore,
    completedSwaps,
    totalSwaps,
    rating: getNumber(item, 'rating'),
    ratingCount: getNumber(item, 'rating_count', 'ratingCount'),
    coinBalance: getNumber(item, 'coins', 'coin_balance', 'coinBalance'),
    featuredSlotsUsed: getNumber(item, 'featured_slots_used', 'featuredSlotsUsed'),
    profileCompleteness: getNumber(item, 'profile_completeness', 'profileCompleteness'),
    isSuspended,
    suspendedReason: typeof item.suspendedReason === 'string' ? item.suspendedReason : undefined,
    lastActiveAt: typeof item.lastActiveAt === 'string' ? item.lastActiveAt : new Date().toISOString(),
  }
}

const mapProduct = (item: Record<string, unknown>): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId:
    typeof item.owner_id === 'object' && item.owner_id !== null
      ? String((item.owner_id as Record<string, unknown>)._id ?? '')
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

export default function MySwapsPage() {
  const router = useRouter()
  const { getCurrentUser } = useApp()
  const user = getCurrentUser()!
  const [allSwaps, setAllSwaps] = useState<SwapRequest[]>([])
  const [swapUsers, setSwapUsers] = useState<Record<string, User>>({})
  const [swapProducts, setSwapProducts] = useState<Record<string, Product>>({})
  const [loading, setLoading] = useState(true)
  const [processingSwapId, setProcessingSwapId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SwapStatus | 'all'>('all')
  const [moreStatusesOpen, setMoreStatusesOpen] = useState(false)
  const moreStatusesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!moreStatusesOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!moreStatusesRef.current?.contains(event.target as Node)) {
        setMoreStatusesOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreStatusesOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreStatusesOpen])

  useEffect(() => {
    let cancelled = false

    const loadSwaps = async (showError = false) => {
      try {
        setLoading(true)
        const token = localStorage.getItem('token') || ''
        const response = await fetch(`${API_BASE_URL}/swaps`, {
          headers: {
            'Authorization': `Bearer ${token}`,
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
              : 'Failed to load swaps.'
          )
        }

        const items =
          typeof data === 'object' &&
          data !== null &&
          'swaps' in data &&
          Array.isArray(data.swaps)
            ? data.swaps
            : []

        const usersById: Record<string, User> = {}
        const productsById: Record<string, Product> = {}

        const mappedSwaps = items.flatMap((item) => {
          if (typeof item !== 'object' || item === null) return []

          const swapItem = item as Record<string, unknown>
          const requesterRaw =
            typeof swapItem.requester === 'object' && swapItem.requester !== null
              ? swapItem.requester as Record<string, unknown>
              : null
          const receiverRaw =
            typeof swapItem.receiver === 'object' && swapItem.receiver !== null
              ? swapItem.receiver as Record<string, unknown>
              : null
          const offeredProductRaw =
            typeof swapItem.product_offered === 'object' && swapItem.product_offered !== null
              ? swapItem.product_offered as Record<string, unknown>
              : null
          const requestedProductRaw =
            typeof swapItem.product_requested === 'object' && swapItem.product_requested !== null
              ? swapItem.product_requested as Record<string, unknown>
              : null

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

          return [{
            id: String(swapItem._id ?? swapItem.id ?? ''),
            requesterId: requester.id,
            receiverId: receiver.id,
            offeredProductId: offeredProduct.id,
            requestedProductId: requestedProduct.id,
            status: normalizeSwapStatus(swapItem.status),
            message: '',
            serviceFeeRequester: Number(swapItem.service_fee_requester ?? swapItem.serviceFeeRequester ?? 0),
            serviceFeeReceiver: Number(swapItem.service_fee_receiver ?? swapItem.serviceFeeReceiver ?? 0),
            requesterPaid: Boolean(swapItem.requester_paid ?? swapItem.requesterPaid ?? false),
            receiverPaid: Boolean(swapItem.receiver_paid ?? swapItem.receiverPaid ?? false),
            exchangeMethod: normalizeExchangeMethod(swapItem.exchange_method ?? swapItem.exchangeMethod),
            deliveryDetails: mapDeliveryDetails(swapItem.delivery_details ?? swapItem.deliveryDetails),
            requesterConfirmed: Boolean(swapItem.requester_confirmed ?? swapItem.requesterConfirmed ?? false),
            receiverConfirmed: Boolean(swapItem.receiver_confirmed ?? swapItem.receiverConfirmed ?? false),
            createdAt: typeof swapItem.createdAt === 'string' ? swapItem.createdAt : new Date().toISOString(),
            updatedAt: typeof swapItem.updatedAt === 'string' ? swapItem.updatedAt : new Date().toISOString(),
            timeline: [],
          }]
        })

        if (!cancelled) {
          setSwapUsers(usersById)
          setSwapProducts(productsById)
          setAllSwaps(mappedSwaps)
        }
      } catch (error) {
        if (!cancelled) {
          setSwapUsers({})
          setSwapProducts({})
          setAllSwaps([])
          if (showError) {
            toast.error(error instanceof Error ? error.message : 'Failed to load swaps.')
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSwaps()

    return () => {
      cancelled = true
    }
  }, [router])

  const handleSwapAction = async (swapId: string, action: 'accept' | 'reject') => {
    try {
      setProcessingSwapId(swapId)
      const response = await fetch(`${API_BASE_URL}/swaps/${swapId}/${action}`, {
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

      const nextStatus: SwapStatus = action === 'accept' ? 'in_discussion' : 'rejected'
      setAllSwaps((current) =>
        current.map((swap) =>
          swap.id === swapId
            ? { ...swap, status: nextStatus, updatedAt: new Date().toISOString() }
            : swap
        )
      )

      toast.success(action === 'accept' ? 'Swap accepted' : 'Swap rejected')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} swap.`)
    } finally {
      setProcessingSwapId(null)
    }
  }

  const filter = (swaps: typeof allSwaps) => {
    let result = swaps
    if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(s => {
        const op = swapProducts[s.offeredProductId]
        const rp = swapProducts[s.requestedProductId]
        const ou = swapUsers[s.requesterId]
        const ru = swapUsers[s.receiverId]
        return (
          op?.title.toLowerCase().includes(q) ||
          rp?.title.toLowerCase().includes(q) ||
          ou?.firstName.toLowerCase().includes(q) ||
          ru?.firstName.toLowerCase().includes(q)
        )
      })
    }
    return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  const sent = filter(allSwaps.filter(s => s.requesterId === user.id))
  const received = filter(allSwaps.filter(s => s.receiverId === user.id))
  const all = filter(allSwaps)
  const activeMoreStatus = MORE_STATUS_FILTERS.find(filter => filter.value === statusFilter)
  const moreStatusActive = Boolean(activeMoreStatus)

  const EmptyState = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ArrowLeftRight className="h-10 w-10 text-muted-foreground/30 mb-4" />
      <p className="font-medium text-muted-foreground">No {label} swaps</p>
      <p className="text-sm text-muted-foreground mt-1 mb-5">
        {label === 'sent' ? 'Find a product you like and request a swap.' : 'Wait for someone to request a swap with your products.'}
      </p>
      {label === 'sent' && (
        <Button asChild variant="outline" size="sm">
          <Link href="/marketplace">Browse marketplace</Link>
        </Button>
      )}
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Swaps</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{allSwaps.length} total swap requests</p>
      </div>

      {/* Search & filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by product or user..."
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => {
                setStatusFilter(f.value)
                setMoreStatusesOpen(false)
              }}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                statusFilter === f.value ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
              )}
            >
              {f.label}
            </button>
          ))}
          <div ref={moreStatusesRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreStatusesOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={moreStatusesOpen}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                moreStatusActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted'
              )}
            >
              <span>{activeMoreStatus?.label ?? 'More statuses'}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', moreStatusesOpen && 'rotate-180')} />
            </button>
            {moreStatusesOpen && (
              <div
                role="menu"
                className="absolute left-0 z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-1.5 shadow-lg"
              >
                {MORE_STATUS_FILTERS.map(f => {
                  const active = statusFilter === f.value

                  return (
                    <button
                      key={f.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setStatusFilter(f.value)
                        setMoreStatusesOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <span>{f.label}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          <TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger>
          <TabsTrigger value="received">Received ({received.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-5 space-y-3">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Loading swaps...</div>
          ) : all.length === 0 ? <EmptyState label="swap" /> : all.map(swap => (
            <SwapCard
              key={swap.id}
              swap={swap}
              currentUserId={user.id}
              requester={swapUsers[swap.requesterId]}
              receiver={swapUsers[swap.receiverId]}
              offeredProduct={swapProducts[swap.offeredProductId]}
              requestedProduct={swapProducts[swap.requestedProductId]}
              onApprove={processingSwapId ? undefined : (id) => handleSwapAction(id, 'accept')}
              onReject={processingSwapId ? undefined : (id) => handleSwapAction(id, 'reject')}
            />
          ))}
        </TabsContent>

        <TabsContent value="sent" className="mt-5 space-y-3">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Loading swaps...</div>
          ) : sent.length === 0 ? <EmptyState label="sent" /> : sent.map(swap => (
            <SwapCard
              key={swap.id}
              swap={swap}
              currentUserId={user.id}
              requester={swapUsers[swap.requesterId]}
              receiver={swapUsers[swap.receiverId]}
              offeredProduct={swapProducts[swap.offeredProductId]}
              requestedProduct={swapProducts[swap.requestedProductId]}
              onApprove={processingSwapId ? undefined : (id) => handleSwapAction(id, 'accept')}
              onReject={processingSwapId ? undefined : (id) => handleSwapAction(id, 'reject')}
            />
          ))}
        </TabsContent>

        <TabsContent value="received" className="mt-5 space-y-3">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">Loading swaps...</div>
          ) : received.length === 0 ? <EmptyState label="received" /> : received.map(swap => (
            <SwapCard
              key={swap.id}
              swap={swap}
              currentUserId={user.id}
              requester={swapUsers[swap.requesterId]}
              receiver={swapUsers[swap.receiverId]}
              offeredProduct={swapProducts[swap.offeredProductId]}
              requestedProduct={swapProducts[swap.requestedProductId]}
              onApprove={processingSwapId ? undefined : (id) => handleSwapAction(id, 'accept')}
              onReject={processingSwapId ? undefined : (id) => handleSwapAction(id, 'reject')}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
