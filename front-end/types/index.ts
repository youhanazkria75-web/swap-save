// ============================================================
// SWAP & SAVE — PLATFORM TYPES
// ============================================================

// ── Users ────────────────────────────────────────────────────

export type TrustLevel = 'new' | 'trusted' | 'risky'

export interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  avatar?: string
  country: string
  city: string
  area?: string
  streetAddress?: string
  bio?: string
  joinedAt: string // ISO date
  isEmailVerified: boolean
  isPhoneVerified: boolean
  isAdmin: boolean
  trustLevel: TrustLevel
  trustScore: number        // 0–100
  completedSwaps: number
  totalSwaps: number
  rating: number            // 0–5
  ratingCount: number
  coinBalance: number
  heldCoins?: number
  totalCoinsEarned?: number
  totalCoinsSpent?: number
  monthlyFreeSwapsUsed?: number
  extraSwapSlots?: number
  priorityMatchesAvailable?: number
  featuredSlotsUsed: number
  profileCompleteness: number // 0–100
  isSuspended: boolean
  suspendedReason?: string
  lastActiveAt: string
}

// ── Products ─────────────────────────────────────────────────

export type ProductCondition = 'new' | 'like-new' | 'good' | 'fair' | 'poor'
export type ProductStatus = 'active' | 'available' | 'reserved' | 'swapped' | 'pending' | 'inactive' | 'rejected'

export interface Product {
  id: string
  ownerId: string
  title: string
  description: string
  category: string
  subcategory?: string
  condition: ProductCondition
  estimatedValue: number    // in EGP
  location: string          // city
  images: string[]          // URLs
  tags: string[]
  status: ProductStatus
  isFeatured: boolean
  featuredUntil?: string    // ISO date
  priorityBoostedAt?: string
  priorityBoostedUntil?: string
  viewCount: number
  savedCount: number
  isSaved?: boolean
  createdAt: string
  updatedAt: string
  // AI matching
  aiScore?: number
  aiMatchReasons?: string[]
}

// ── Swap Requests ─────────────────────────────────────────────

export type SwapStatus =
  | 'pending'          // 1. Request sent, awaiting response
  | 'in_discussion'    // 2. Receiver accepted, both users discussing
  | 'under_review'     // 3. Admin reviewing
  | 'approved'         // 4. Admin approved → unlock exchange
  | 'rejected'         // 4b. Admin rejected
  | 'payment_pending'  // 5. Service fee awaiting payment
  | 'exchange_setup'   // 6. Choosing meetup/delivery
  | 'in_progress'      // 7. Actively exchanging
  | 'completed'        // 8. Both confirmed done
  | 'cancelled'        // Cancelled by either party
  | 'disputed'         // Under dispute

export type ExchangeMethod = 'meetup' | 'delivery'
export type ExchangeProposalStatus = 'none' | 'pending' | 'accepted' | 'changes_requested'
export type CompensationStatus = 'none' | 'proposed' | 'held' | 'released' | 'refunded' | 'rejected'
export type DeliveryLifecycleStatus =
  | 'pending_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'delivered_to_receiver'
  | 'delivery_completed'

export interface MeetupDetails {
  city: string
  area: string
  meetingPoint: string
  date: string
  time: string
  additionalNotes?: string
}

export interface DeliveryPickupDetails {
  address: string
  country: string
  city: string
  area: string
  preferredDate: string
  preferredTime: string
  notes?: string
  submitted: boolean
}

export interface DeliveryTrackingDetails {
  requesterItemPickedUp: boolean
  receiverItemPickedUp: boolean
  deliveredToRequester: boolean
  deliveredToReceiver: boolean
}

export interface DeliveryDetails {
  requesterPickup: DeliveryPickupDetails
  receiverPickup: DeliveryPickupDetails
  feePerUser: number
  paymentMethod: 'cash_to_courier'
  deliveryStatus: DeliveryLifecycleStatus
  tracking: DeliveryTrackingDetails
}

export interface SwapRequest {
  id: string
  requesterId: string    // user who sent the request
  receiverId: string     // user who owns the desired product
  offeredProductId: string
  requestedProductId: string
  status: SwapStatus
  message: string        // initial message from requester
  adminNotes?: string
  adminReviewedBy?: string
  adminReviewedAt?: string
  serviceFeeRequester: number  // EGP
  serviceFeeReceiver: number
  requesterPaid: boolean
  receiverPaid: boolean
  serviceFeeCurrentUser?: {
    side: 'requester' | 'receiver'
    paid: boolean
    pending: boolean
    status: 'unpaid' | 'pending' | 'completed' | 'failed' | 'expired'
    transactionId?: string
    checkoutUrl?: string
    paymentUrl?: string
    iframeUrl?: string
    canContinue?: boolean
    reason?: string
  }
  exchangeMethod?: ExchangeMethod
  meetupDetails?: MeetupDetails
  deliveryDetails?: DeliveryDetails
  exchangeProposedBy?: string
  exchangeAcceptedBy?: string
  exchangeProposalStatus?: ExchangeProposalStatus
  compensationAmount?: number
  compensationPayer?: string
  compensationReceiver?: string
  compensationStatus?: CompensationStatus
  compensationProposedBy?: string
  compensationAcceptedBy?: string
  compensationProposedAt?: string
  compensationAcceptedAt?: string
  compensationRejectedAt?: string
  reportCount?: number
  openReportCount?: number
  requesterConfirmed: boolean
  receiverConfirmed: boolean
  requesterRatingId?: string
  receiverRatingId?: string
  createdAt: string
  updatedAt: string
  timeline: SwapTimelineEvent[]
}

export interface SwapTimelineEvent {
  id: string
  swapId: string
  event: string
  description: string
  actor: 'system' | 'requester' | 'receiver' | 'admin'
  actorId?: string
  createdAt: string
}

// ── Messages / Discussion ─────────────────────────────────────

export type MessageType = 'text' | 'system' | 'offer' | 'admin-note'

export interface Message {
  id: string
  swapId: string
  senderId: string
  type: MessageType
  content: string
  isAdminVisible: boolean
  isReported: boolean
  reportReason?: string
  createdAt: string
  readBy: string[]
}

// ── Ratings ───────────────────────────────────────────────────

export interface Rating {
  id: string
  swapId: string
  raterId: string
  ratedUserId: string
  score: number        // 1–5
  comment: string
  tags: string[]       // e.g. ['punctual', 'item-as-described']
  createdAt: string
}

// ── Notifications ─────────────────────────────────────────────

export type NotificationType =
  | 'swap-request'
  | 'swap-accepted'
  | 'swap-rejected'
  | 'swap-approved'
  | 'swap-completed'
  | 'message'
  | 'payment'
  | 'rating'
  | 'system'
  | 'delivery'
  | 'report'
  | 'promotion'
  | 'weekly-digest'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  message?: string
  isRead: boolean
  actionUrl?: string
  targetType?: string
  targetId?: string
  targetUrl?: string
  relatedSwapId?: string
  relatedProductId?: string
  createdAt: string
}

// ── Reports & Disputes ────────────────────────────────────────

export type ReportTarget = 'user' | 'product' | 'swap' | 'message'
export type ReportStatus = 'open' | 'under_review' | 'resolved' | 'dismissed'

export interface Report {
  id: string
  reporterId: string
  targetType: ReportTarget
  targetId: string
  reason: string
  description: string
  status: ReportStatus
  adminNotes?: string
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
}

export type DisputeStatus = 'open' | 'under-review' | 'resolved-requester' | 'resolved-receiver' | 'resolved-mutual'

export interface Dispute {
  id: string
  swapId: string
  openedBy: string
  reason: string
  description: string
  status: DisputeStatus
  adminNotes?: string
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
}

// ── Transactions ──────────────────────────────────────────────

export type TransactionType =
  | 'signup_bonus'
  | 'coin_hold'
  | 'coin_release'
  | 'coin_credit'
  | 'coin_refund'
  | 'feature_product'
  | 'extra_swap_slot'
  | 'priority_matching'
  | 'swap_completion_reward'
  | 'phone_verification_reward'
  | 'profile_complete_reward'
  | 'admin_adjustment'
  | 'package_purchase_pending'
  | 'package_purchase_completed'
  | 'service_fee'
  | 'coin-purchase'
  | 'coin-spend'
  | 'refund'
  | 'featured-product'
export type TransactionDirection = 'debit' | 'credit' | 'hold' | 'release' | 'refund' | 'adjustment'
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'expired'

export interface Transaction {
  id: string
  userId: string
  swapId?: string
  productId?: string
  type: TransactionType
  direction?: TransactionDirection
  amount: number
  currency: 'EGP' | 'COINS' | 'coins'
  status: TransactionStatus
  description: string
  metadata?: Record<string, unknown>
  paymentMethod?: string
  referenceNumber?: string
  createdAt: string
}

// ── Coins ─────────────────────────────────────────────────────

export interface CoinPackage {
  id: string
  name: string
  coins: number
  price: number  // EGP
  isPopular: boolean
  bonus?: number // bonus coins
}

// ── Categories ────────────────────────────────────────────────

export interface Category {
  id: string
  name: string
  slug: string
  description: string
  icon: string   // lucide icon name
  color: string  // tailwind color class
  productCount: number
  subcategories: string[]
}

// ── AI Recommendations ────────────────────────────────────────

export interface AIRecommendation {
  id: string
  userId: string
  productId: string
  matchScore: number   // 0–100
  reasons: AIMatchReason[]
  createdAt: string
}

export interface AIMatchReason {
  type: 'category' | 'value' | 'location' | 'condition' | 'priority' | 'interest'
  label: string
  weight: number  // contribution to score
}

// ── Admin ─────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  newUsersToday: number
  totalProducts: number
  activeProducts: number
  totalSwaps: number
  pendingApprovals: number
  approvedSwaps: number
  rejectedSwaps: number
  completedSwaps: number
  openReports: number
  suspiciousFlags: number
  totalRevenue: number
  revenueToday: number
  coinsSold: number
}

export interface SuspiciousActivity {
  id: string
  userId: string
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
  isReviewed: boolean
  reviewedBy?: string
  reviewedAt?: string
  createdAt: string
}

// ── Auth ──────────────────────────────────────────────────────

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

export interface LoginCredentials {
  emailOrPhone: string
  password: string
}

export interface SignupData {
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  city: string
  streetAddress: string
  password: string
  confirmPassword: string
  agreeToTerms: boolean
}

// ── Forms ─────────────────────────────────────────────────────

export interface ProductFormData {
  title: string
  description: string
  category: string
  subcategory: string
  condition: ProductCondition
  estimatedValue: number
  location: string
  tags: string
  images: File[]
}

export interface SwapRequestFormData {
  offeredProductId: string
  message: string
}

export interface MeetupFormData {
  city: string
  area: string
  meetingPoint: string
  date: string
  time: string
  additionalNotes?: string
}

// ── Pagination & Filters ──────────────────────────────────────

export interface PaginationState {
  page: number
  pageSize: number
  total: number
}

export interface ProductFilters {
  search: string
  category: string
  condition: string
  minValue: number
  maxValue: number
  location: string
  sortBy: 'newest' | 'value-asc' | 'value-desc' | 'popular'
  isFeatured?: boolean
}

export interface SwapFilters {
  status: SwapStatus | 'all'
  sortBy: 'newest' | 'oldest'
}

// ── Utility types ─────────────────────────────────────────────

export type WithOwner<T> = T & { owner: User }
export type WithProducts<T> = T & { offeredProduct: Product; requestedProduct: Product }
export type FullSwap = SwapRequest & {
  requester: User
  receiver: User
  offeredProduct: Product
  requestedProduct: Product
  messages: Message[]
}
