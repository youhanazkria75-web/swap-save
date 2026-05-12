'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Sparkles, MapPin, Star, ArrowLeftRight, RefreshCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConditionBadge } from '@/components/shared/status-badges'
import { toast } from 'sonner'
import { API_BASE_URL as API_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import type { Product, ProductCondition, ProductStatus, User } from '@/types'

const REASON_COLORS: Record<string, string> = {
  category:  'bg-blue-50 text-blue-700 border-blue-200',
  value:     'bg-green-50 text-green-700 border-green-200',
  location:  'bg-amber-50 text-amber-700 border-amber-200',
  condition: 'bg-purple-50 text-purple-700 border-purple-200',
  priority:  'bg-pink-50 text-pink-700 border-pink-200',
}

type BackendRecord = Record<string, unknown>

interface MatchReason {
  type: string
  label: string
  weight: number
}

interface ScoreBreakdown {
  category: number
  value: number
  location: number
  condition: number
  priority: number
}

interface Recommendation {
  id: string
  candidateProduct: Product
  userProduct: Product
  owner?: User
  score: number
  reasons: MatchReason[]
  scoreBreakdown: ScoreBreakdown
}

type WalletSummary = {
  priority_matches_available?: number
}

const isRecord = (value: unknown): value is BackendRecord =>
  typeof value === 'object' && value !== null

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const normalizeProductStatus = (status: unknown): ProductStatus => {
  switch (status) {
    case 'available':
    case 'active':
      return 'active'
    case 'reserved':
      return 'reserved'
    case 'swapped':
    case 'completed':
      return 'swapped'
    case 'pending':
    case 'under-review':
      return 'pending'
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
  if (typeof condition !== 'string') {
    return 'good'
  }

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

const getProductOwnerId = (product: BackendRecord): string => {
  const owner = product.owner_id

  if (isRecord(owner)) {
    return typeof owner._id === 'string' ? owner._id : ''
  }

  return typeof owner === 'string' ? owner : ''
}

const mapProduct = (product: BackendRecord): Product => ({
  id: typeof product._id === 'string' ? product._id : typeof product.id === 'string' ? product.id : '',
  ownerId: getProductOwnerId(product),
  title: typeof product.title === 'string' ? product.title : '',
  description: typeof product.description === 'string' ? product.description : '',
  category: typeof product.category === 'string' ? product.category : '',
  subcategory: typeof product.subcategory === 'string' ? product.subcategory : '',
  condition: normalizeProductCondition(product.condition),
  estimatedValue: toNumber(product.estimated_value),
  location: typeof product.location === 'string' && product.location.trim() ? product.location : 'Location not provided',
  images: Array.isArray(product.images) ? product.images.filter((image): image is string => typeof image === 'string') : [],
  tags: Array.isArray(product.tags) ? product.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  status: normalizeProductStatus(product.status),
  isFeatured: Boolean(product.is_featured),
  featuredUntil: typeof product.featured_until === 'string' ? product.featured_until : undefined,
  priorityBoostedAt: typeof product.priority_boosted_at === 'string' ? product.priority_boosted_at : undefined,
  priorityBoostedUntil: typeof product.priority_boosted_until === 'string' ? product.priority_boosted_until : undefined,
  viewCount: toNumber(product.view_count),
  savedCount: toNumber(product.saved_count),
  createdAt: typeof product.createdAt === 'string' ? product.createdAt : '',
  updatedAt: typeof product.updatedAt === 'string' ? product.updatedAt : '',
})

const mapOwner = (owner: BackendRecord): User => ({
  id: typeof owner._id === 'string' ? owner._id : typeof owner.id === 'string' ? owner.id : '',
  firstName: typeof owner.first_name === 'string' ? owner.first_name : '',
  lastName: typeof owner.last_name === 'string' ? owner.last_name : '',
  email: '',
  avatar: typeof owner.avatar === 'string' ? owner.avatar : undefined,
  country: typeof owner.country === 'string' ? owner.country : '',
  city: typeof owner.city === 'string' ? owner.city : '',
  streetAddress: undefined,
  joinedAt: typeof owner.createdAt === 'string' ? owner.createdAt : '',
  isEmailVerified: Boolean(owner.isEmailVerified),
  isPhoneVerified: Boolean(owner.isPhoneVerified),
  isAdmin: false,
  trustLevel: toNumber(owner.trust_score) >= 70 ? 'trusted' : toNumber(owner.trust_score) < 35 ? 'risky' : 'new',
  trustScore: toNumber(owner.trust_score),
  completedSwaps: toNumber(owner.completed_swaps),
  totalSwaps: toNumber(owner.completed_swaps),
  rating: toNumber(owner.rating),
  ratingCount: toNumber(owner.rating_count),
  coinBalance: 0,
  featuredSlotsUsed: 0,
  profileCompleteness: 0,
  isSuspended: false,
  lastActiveAt: '',
})

const mapReasons = (value: unknown): MatchReason[] =>
  Array.isArray(value)
    ? value
        .filter(isRecord)
        .map(reason => ({
          type: typeof reason.type === 'string' ? reason.type : '',
          label: typeof reason.label === 'string' ? reason.label : '',
          weight: toNumber(reason.weight),
        }))
        .filter(reason => reason.type && reason.label && reason.weight > 0)
    : []

const mapBreakdown = (value: unknown): ScoreBreakdown => {
  const breakdown = isRecord(value) ? value : {}

  return {
    category: toNumber(breakdown.category),
    value: toNumber(breakdown.value),
    location: toNumber(breakdown.location),
    condition: toNumber(breakdown.condition),
    priority: toNumber(breakdown.priority),
  }
}

const mapRecommendation = (item: BackendRecord): Recommendation | null => {
  const candidateRaw = item.candidate_product
  const userProductRaw = item.user_product

  if (!isRecord(candidateRaw) || !isRecord(userProductRaw)) {
    return null
  }

  const ownerRaw = candidateRaw.owner_id
  const candidateProduct = mapProduct(candidateRaw)
  const mappedOwner = isRecord(ownerRaw) ? mapOwner(ownerRaw) : undefined
  const ownerRating = toNumber(item.candidate_owner_rating)
  const ownerRatingCount = toNumber(item.candidate_owner_rating_count)

  return {
    id: `${candidateProduct.id}-${isRecord(userProductRaw) ? String(userProductRaw._id ?? userProductRaw.id ?? '') : ''}`,
    candidateProduct,
    userProduct: mapProduct(userProductRaw),
    owner: mappedOwner
      ? { ...mappedOwner, rating: ownerRating, ratingCount: ownerRatingCount }
      : undefined,
    score: toNumber(item.score),
    reasons: mapReasons(item.reasons),
    scoreBreakdown: mapBreakdown(item.scoreBreakdown),
  }
}

const isPriorityBoostActive = (product: Product) =>
  Boolean(product.priorityBoostedUntil && new Date(product.priorityBoostedUntil).getTime() > Date.now())

export default function RecommendationsPage() {
  const [minScore, setMinScore] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasSourceProducts, setHasSourceProducts] = useState(true)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [sourceProducts, setSourceProducts] = useState<Product[]>([])
  const [priorityCredits, setPriorityCredits] = useState(0)
  const [selectedPriorityProductId, setSelectedPriorityProductId] = useState('')
  const [applyingPriority, setApplyingPriority] = useState(false)

  const loadPriorityBoostOptions = useCallback(async () => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      return
    }

    const headers = { Authorization: `Bearer ${token}` }
    const [productsResponse, walletResponse] = await Promise.all([
      fetch(`${API_URL}/products/mine`, { headers }),
      fetch(`${API_URL}/users/me/wallet`, { headers }),
    ])
    const productsData: unknown = await productsResponse.json().catch(() => null)
    const walletData: unknown = await walletResponse.json().catch(() => null)

    if (!productsResponse.ok || !walletResponse.ok || !isRecord(productsData) || !isRecord(walletData)) {
      return
    }

    const availableProducts = Array.isArray(productsData.products)
      ? productsData.products
          .filter(isRecord)
          .map(mapProduct)
          .filter(product => product.status === 'active' || product.status === 'available')
      : []
    const wallet = isRecord(walletData.wallet) ? walletData.wallet as WalletSummary : null

    setSourceProducts(availableProducts)
    setPriorityCredits(toNumber(wallet?.priority_matches_available))
    setSelectedPriorityProductId(current => {
      if (current && availableProducts.some(product => product.id === current && !isPriorityBoostActive(product))) {
        return current
      }

      return availableProducts.find(product => !isPriorityBoostActive(product))?.id || ''
    })
  }, [])

  const loadRecommendations = useCallback(async ({ showToast = false } = {}) => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      window.location.href = '/login'
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/products/recommendations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      const data: unknown = await response.json()

      if (!response.ok || !isRecord(data)) {
        throw new Error(isRecord(data) && typeof data.message === 'string' ? data.message : 'Failed to load recommendations.')
      }

      const sourceCount = toNumber(data.source_products_count)
      const items = Array.isArray(data.recommendations) ? data.recommendations : []

      setHasSourceProducts(sourceCount > 0)
      setRecommendations(
        items
          .filter(isRecord)
          .map(mapRecommendation)
          .filter((recommendation): recommendation is Recommendation => recommendation !== null)
      )

      if (showToast) {
        toast.success('Recommendations refreshed!')
      }

      await loadPriorityBoostOptions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load recommendations.')
      setRecommendations([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loadPriorityBoostOptions])

  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const filteredRecommendations = useMemo(
    () => recommendations.filter(recommendation => recommendation.score >= minScore),
    [recommendations, minScore]
  )

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadRecommendations({ showToast: true })
  }

  const handleApplyPriorityBoost = async () => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      window.location.href = '/login'
      return
    }

    if (!selectedPriorityProductId) {
      toast.error('Choose an available product to boost.')
      return
    }

    setApplyingPriority(true)

    try {
      const response = await fetch(`${API_URL}/products/${selectedPriorityProductId}/priority-boost`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(isRecord(data) && typeof data.message === 'string' ? data.message : 'Failed to apply priority boost.')
      }

      toast.success('Priority boost applied for 7 days')
      await loadRecommendations()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply priority boost.')
      await loadPriorityBoostOptions().catch(() => {})
    } finally {
      setApplyingPriority(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h1 className="text-2xl font-bold">AI Matches</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Smart recommendations based on your available products, marketplace availability, category, estimated value, location, and condition.
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} loading={refreshing || loading}>
          <RefreshCw className="h-4 w-4" /> Refresh matches
        </Button>
      </div>

      <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
        <p className="text-sm font-semibold text-purple-800 mb-3">How your match score is calculated</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Category', weight: '30%', color: 'text-blue-600' },
            { label: 'Value', weight: '28%', color: 'text-green-600' },
            { label: 'Location', weight: '22%', color: 'text-amber-600' },
            { label: 'Condition', weight: '20%', color: 'text-purple-600' },
          ].map(f => (
            <div key={f.label} className="text-center">
              <p className={cn('text-xl font-bold', f.color)}>{f.weight}</p>
              <p className="text-xs text-purple-700">{f.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-purple-700">
          Scores are guidance, not guarantees. Products already tied to active swaps are excluded, and priority boosts can improve ranking when available.
        </p>
      </div>

      {sourceProducts.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-pink-600" />
                <p className="text-sm font-semibold">Priority boost</p>
                <Badge variant="secondary">{priorityCredits} credit{priorityCredits === 1 ? '' : 's'}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Apply one purchased credit to an available product for a 7-day recommendation boost.
              </p>
              <select
                value={selectedPriorityProductId}
                onChange={event => setSelectedPriorityProductId(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                disabled={priorityCredits <= 0 || applyingPriority}
              >
                <option value="">Choose a product</option>
                {sourceProducts.map(product => (
                  <option key={product.id} value={product.id} disabled={isPriorityBoostActive(product)}>
                    {product.title || 'Untitled product'}{isPriorityBoostActive(product) ? ' - boost active' : ''}
                  </option>
                ))}
              </select>
            </div>
            {priorityCredits > 0 ? (
              <Button
                onClick={handleApplyPriorityBoost}
                loading={applyingPriority}
                disabled={!selectedPriorityProductId || applyingPriority}
              >
                <Zap className="h-4 w-4" />
                Apply priority boost
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/user/coins">Buy priority credit</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm text-muted-foreground shrink-0">Min score:</span>
          <input
            type="range" min={0} max={90} step={10} value={minScore}
            onChange={e => setMinScore(+e.target.value)}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-medium w-10 shrink-0">{minScore}%</span>
        </div>
        <Badge className="bg-purple-50 text-purple-700 border-purple-200">
          {filteredRecommendations.length} match{filteredRecommendations.length !== 1 ? 'es' : ''}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="bg-muted rounded-2xl h-44 animate-pulse" />
          ))}
        </div>
      ) : !hasSourceProducts ? (
        <div className="text-center py-16">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-medium text-muted-foreground">List a product to unlock smart recommendations</p>
          <p className="text-sm text-muted-foreground mt-1">Your available products are used as the source for matching.</p>
        </div>
      ) : filteredRecommendations.length === 0 ? (
        <div className="text-center py-16">
          <Sparkles className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-medium text-muted-foreground">No recommendations found yet</p>
          <p className="text-sm text-muted-foreground mt-1">Try lowering the minimum score or adding more product details.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRecommendations.map(recommendation => {
            const product = recommendation.candidateProduct
            const owner = recommendation.owner
            const scoreColor = recommendation.score >= 90 ? 'text-green-700 bg-green-100 border-green-200' :
                               recommendation.score >= 80 ? 'text-blue-700 bg-blue-100 border-blue-200' :
                               'text-amber-700 bg-amber-100 border-amber-200'
            const breakdownItems = [
              { type: 'category', label: 'Category', weight: recommendation.scoreBreakdown.category },
              { type: 'value', label: 'Value', weight: recommendation.scoreBreakdown.value },
              { type: 'location', label: 'Location', weight: recommendation.scoreBreakdown.location },
              { type: 'condition', label: 'Condition', weight: recommendation.scoreBreakdown.condition },
              { type: 'priority', label: 'Priority', weight: recommendation.scoreBreakdown.priority },
            ].filter(item => item.weight > 0)

            return (
              <div key={recommendation.id} className="bg-card rounded-2xl border border-border p-5 hover:shadow-card-hover transition-shadow">
                <div className="flex gap-4">
                  <div className="h-24 w-24 rounded-xl overflow-hidden bg-muted shrink-0">
                    {product.images[0] && <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h3 className="font-semibold">{product.title || 'Untitled product'}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <ConditionBadge condition={product.condition} />
                          <span className="text-sm font-bold text-primary">~{product.estimatedValue.toLocaleString()} EGP</span>
                        </div>
                      </div>
                      <div className={cn('flex items-center gap-1 px-3 py-1 rounded-full border text-sm font-bold shrink-0', scoreColor)}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {recommendation.score}%
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground flex-wrap">
                      <MapPin className="h-3 w-3" /> {product.location}
                      {owner && (
                        <>
                          <span>·</span>
                          <span>{owner.firstName} {owner.lastName}</span>
                          {owner.rating > 0 && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-0.5 text-amber-500">
                                <Star className="h-3 w-3 fill-current" />
                                {owner.rating.toFixed(1)}
                              </span>
                            </>
                          )}
                          {owner.trustScore > 0 && (
                            <>
                              <span>|</span>
                              <span>{owner.trustScore}% trust</span>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mb-3">
                      Matched with your product: <span className="font-medium text-foreground">{recommendation.userProduct.title || 'Untitled product'}</span>
                    </p>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {recommendation.reasons.map(reason => (
                        <span
                          key={`${recommendation.id}-${reason.type}`}
                          className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', REASON_COLORS[reason.type] || 'bg-muted text-muted-foreground border-border')}
                        >
                          {reason.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex gap-1 mb-2">
                    {breakdownItems.map(item => (
                      <div
                        key={`${recommendation.id}-${item.type}-bar`}
                        className="h-1.5 rounded-full bg-primary opacity-80"
                        style={{ flex: item.weight }}
                        title={`${item.label}: ${item.weight} points`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Match score</p>
                    <Button asChild size="sm">
                      <Link href={`/products/${product.id}`}>
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                        View & Swap
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
