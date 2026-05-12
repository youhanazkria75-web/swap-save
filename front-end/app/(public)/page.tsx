'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  ArrowLeftRight, Sparkles, ShieldCheck, Star, ChevronRight,
  Users, Package, CheckCircle2, Zap, Search, MapPin,
  TrendingUp, Clock, BadgeCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/shared/product-card'
import { API_BASE_URL } from '@/lib/api-config'
import { PRODUCT_CATEGORIES } from '@/lib/product-categories'
import { cn } from '@/lib/utils'
import type { Product, ProductCondition, ProductStatus, TrustLevel, User } from '@/types'

const CATEGORY_ICONS: Record<string, string> = {
  'Electronics': '\u{1F4BB}', 'Fashion': '\u{1F457}', 'Home & Garden': '\u{1F3E0}',
  'Sports & Outdoors': '\u{1F6B4}', 'Books & Media': '\u{1F4DA}', 'Vehicles': '\u{1F697}',
  'Kids & Baby': '\u{1F9F8}', 'Art & Collectibles': '\u{1F3A8}',
}

const DEFAULT_CATEGORY_ICON = '\u{1F4E6}'

const HOW_IT_WORKS = [
  { step: '01', icon: Package, title: 'List your item', desc: 'Add photos, condition, category, and estimated value. Approved items appear on the marketplace.' },
  { step: '02', icon: ArrowLeftRight, title: 'Request a swap', desc: 'Choose a product you want and offer one of your available items in exchange.' },
  { step: '03', icon: Users, title: 'Discuss and agree', desc: 'Chat safely on-platform, compare values, and optionally agree on coin compensation.' },
  { step: '04', icon: ShieldCheck, title: 'Admin review', desc: 'Submit the swap for admin review. Our team checks fairness, safety, and product details.' },
  { step: '05', icon: Clock, title: 'Pay and arrange exchange', desc: 'Pay the service fee, then choose meetup or platform-managed delivery.' },
  { step: '06', icon: CheckCircle2, title: 'Complete and rate', desc: 'Both users confirm completion, products are marked swapped, and ratings update trust scores.' },
]

const TRUST_FEATURES = [
  { icon: ShieldCheck, title: 'Admin-reviewed swaps', desc: 'Every swap passes admin approval before completion for fairness and safety.' },
  { icon: BadgeCheck, title: 'Verified accounts', desc: 'Email and phone verification help build trusted exchanges.' },
  { icon: Star, title: 'Ratings & reputation', desc: 'Complete swaps, leave ratings, and build your marketplace reputation.' },
  { icon: Zap, title: 'AI smart matching', desc: 'Our matching engine finds relevant swap opportunities based on value and category.' },
  { icon: Clock, title: 'Transaction ledger', desc: 'Every coin hold, release, refund, and fee is recorded transparently.' },
  { icon: TrendingUp, title: 'Protected value compensation', desc: 'Coin compensation is held securely and released only after successful completion.' },
]

type HomeSummaryStats = {
  totalProducts: number
  registeredUsers: number
  completedSwaps: number
  averageRating: number
}

type HomeSummaryCategory = {
  name: string
  count: number
}

type AiPreviewStatus = 'guest' | 'loading' | 'ready' | 'no-products' | 'no-matches' | 'error'

type AiPreviewMatch = {
  id: string
  product: Product
  score: number
  reasons: string[]
  ownerRating: number
  ownerRatingCount: number
  ownerTrustScore: number
}

type ApiRecord = Record<string, unknown>

const DEFAULT_HOME_STATS: HomeSummaryStats = {
  totalProducts: 0,
  registeredUsers: 0,
  completedSwaps: 0,
  averageRating: 0,
}

const isRecord = (value: unknown): value is ApiRecord =>
  typeof value === 'object' && value !== null

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const decodeHtmlEntities = (value: unknown): string => {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

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

const getOwnerId = (product: ApiRecord): string => {
  const owner = product.owner_id

  if (isRecord(owner)) {
    return typeof owner._id === 'string' ? owner._id : ''
  }

  return typeof owner === 'string' ? owner : ''
}

const trustLevelFromScore = (trustScore: number): TrustLevel => {
  if (trustScore >= 70) {
    return 'trusted'
  }

  if (trustScore < 35) {
    return 'risky'
  }

  return 'new'
}

const mapFeaturedProduct = (product: ApiRecord): Product => ({
  id: typeof product._id === 'string' ? product._id : typeof product.id === 'string' ? product.id : '',
  ownerId: getOwnerId(product),
  title: typeof product.title === 'string' ? product.title : '',
  description: typeof product.description === 'string' ? product.description : '',
  category: decodeHtmlEntities(product.category),
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
  isSaved: Boolean(product.is_saved),
  createdAt: typeof product.createdAt === 'string' ? product.createdAt : '',
  updatedAt: typeof product.updatedAt === 'string' ? product.updatedAt : '',
})

const mapFeaturedOwner = (owner: ApiRecord): User => {
  const trustScore = toNumber(owner.trust_score ?? owner.trustScore)

  return {
    id: typeof owner._id === 'string' ? owner._id : typeof owner.id === 'string' ? owner.id : '',
    firstName: typeof owner.first_name === 'string' ? owner.first_name : '',
    lastName: typeof owner.last_name === 'string' ? owner.last_name : '',
    email: '',
    avatar: typeof owner.avatar === 'string' ? owner.avatar : undefined,
    country: typeof owner.country === 'string' ? owner.country : '',
    city: typeof owner.city === 'string' ? owner.city : '',
    area: typeof owner.area === 'string' ? owner.area : '',
    streetAddress: undefined,
    joinedAt: typeof owner.createdAt === 'string' ? owner.createdAt : '',
    isEmailVerified: Boolean(owner.isEmailVerified),
    isPhoneVerified: Boolean(owner.isPhoneVerified),
    isAdmin: false,
    trustLevel: trustLevelFromScore(trustScore),
    trustScore,
    completedSwaps: toNumber(owner.completed_swaps ?? owner.completedSwaps),
    totalSwaps: toNumber(owner.completed_swaps ?? owner.completedSwaps),
    rating: toNumber(owner.rating),
    ratingCount: toNumber(owner.rating_count ?? owner.ratingCount),
    coinBalance: 0,
    featuredSlotsUsed: 0,
    profileCompleteness: 0,
    isSuspended: false,
    lastActiveAt: '',
  }
}

const mapAiPreviewReasons = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter(isRecord)
        .map(reason => (typeof reason.label === 'string' ? reason.label : ''))
        .filter(Boolean)
    : []

const mapAiPreviewMatch = (item: ApiRecord): AiPreviewMatch | null => {
  const candidateRaw = item.candidate_product

  if (!isRecord(candidateRaw)) {
    return null
  }

  const product = mapFeaturedProduct(candidateRaw)

  if (!product.id || !product.title) {
    return null
  }

  const candidateOwner = isRecord(candidateRaw.owner_id) ? candidateRaw.owner_id : null

  return {
    id: `${product.id}-${toNumber(item.score)}`,
    product,
    score: toNumber(item.score),
    reasons: mapAiPreviewReasons(item.reasons),
    ownerRating: toNumber(item.candidate_owner_rating),
    ownerRatingCount: toNumber(item.candidate_owner_rating_count),
    ownerTrustScore: toNumber(item.candidate_owner_trust_score ?? candidateOwner?.trust_score),
  }
}

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [homeStats, setHomeStats] = useState<HomeSummaryStats>(DEFAULT_HOME_STATS)
  const [heroCategories, setHeroCategories] = useState<HomeSummaryCategory[]>([])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([])
  const [featuredOwners, setFeaturedOwners] = useState<User[]>([])
  const [featuredSavedStates, setFeaturedSavedStates] = useState<Record<string, boolean>>({})
  const [latestProducts, setLatestProducts] = useState<Product[]>([])
  const [latestOwners, setLatestOwners] = useState<User[]>([])
  const [latestSavedStates, setLatestSavedStates] = useState<Record<string, boolean>>({})
  const [aiPreviewStatus, setAiPreviewStatus] = useState<AiPreviewStatus>('loading')
  const [aiPreviewMatches, setAiPreviewMatches] = useState<AiPreviewMatch[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  const featuredOwnerMap = Object.fromEntries(featuredOwners.map(owner => [owner.id, owner]))
  const latestOwnerMap = Object.fromEntries(latestOwners.map(owner => [owner.id, owner]))

  useEffect(() => {
    let cancelled = false

    const loadHomeSummary = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/products/home-summary`)
        const data: unknown = await response.json()

        if (!response.ok || !isRecord(data)) {
          throw new Error('Failed to load homepage summary.')
        }

        if (cancelled) {
          return
        }

        const stats = isRecord(data.stats) ? data.stats : {}
        const topCategories = Array.isArray(data.top_categories) ? data.top_categories : []
        const browseCategoryCounts = isRecord(data.category_counts) ? data.category_counts : {}

        setHomeStats({
          totalProducts: toNumber(stats.total_products),
          registeredUsers: toNumber(stats.registered_users),
          completedSwaps: toNumber(stats.completed_swaps),
          averageRating: toNumber(stats.average_rating),
        })

        setHeroCategories(
          topCategories
            .filter(isRecord)
            .map(category => ({
              name: decodeHtmlEntities(category.name),
              count: toNumber(category.count),
            }))
            .filter(category => category.name && category.count > 0)
        )
        setCategoryCounts(
          Object.fromEntries(
            Object.entries(browseCategoryCounts).map(([category, count]) => [
              decodeHtmlEntities(category),
              toNumber(count),
            ])
          )
        )
      } catch {
        if (!cancelled) {
          setHomeStats(DEFAULT_HOME_STATS)
          setHeroCategories([])
          setCategoryCounts({})
        }
      }
    }

    loadHomeSummary()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadFeaturedProducts = async () => {
      try {
        const token = localStorage.getItem('token') || ''
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const response = await fetch(`${API_BASE_URL}/products/featured?limit=4`, { headers })
        const data: unknown = await response.json()

        if (!response.ok || !isRecord(data) || !Array.isArray(data.products)) {
          throw new Error('Failed to load featured products.')
        }

        if (cancelled) {
          return
        }

        const productRecords = data.products.filter(isRecord)

        setFeaturedProducts(productRecords.map(mapFeaturedProduct))
        setFeaturedOwners(
          productRecords
            .map(product => product.owner_id)
            .filter(isRecord)
            .map(mapFeaturedOwner)
        )
        setFeaturedSavedStates(
          Object.fromEntries(
            productRecords.map(product => [
              typeof product._id === 'string' ? product._id : '',
              Boolean(product.is_saved),
            ])
          )
        )
      } catch {
        if (!cancelled) {
          setFeaturedProducts([])
          setFeaturedOwners([])
          setFeaturedSavedStates({})
        }
      }
    }

    loadFeaturedProducts()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadLatestProducts = async () => {
      try {
        const token = localStorage.getItem('token') || ''
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const response = await fetch(`${API_BASE_URL}/products?status=available&sort=newest&limit=8`, { headers })
        const data: unknown = await response.json()

        if (!response.ok || !isRecord(data) || !Array.isArray(data.products)) {
          throw new Error('Failed to load latest products.')
        }

        if (cancelled) {
          return
        }

        const productRecords = data.products.filter(isRecord)

        setLatestProducts(productRecords.map(mapFeaturedProduct))
        setLatestOwners(
          productRecords
            .map(product => product.owner_id)
            .filter(isRecord)
            .map(mapFeaturedOwner)
        )
        setLatestSavedStates(
          Object.fromEntries(
            productRecords.map(product => [
              typeof product._id === 'string' ? product._id : '',
              Boolean(product.is_saved),
            ])
          )
        )
      } catch {
        if (!cancelled) {
          setLatestProducts([])
          setLatestOwners([])
          setLatestSavedStates({})
        }
      }
    }

    loadLatestProducts()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadAiPreview = async () => {
      const token = localStorage.getItem('token') || ''

      if (!token) {
        if (!cancelled) {
          setIsLoggedIn(false)
          setAiPreviewMatches([])
          setAiPreviewStatus('guest')
        }
        return
      }

      try {
        setIsLoggedIn(true)
        setAiPreviewStatus('loading')

        const response = await fetch(`${API_BASE_URL}/products/recommendations`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data: unknown = await response.json().catch(() => null)

        if (cancelled) {
          return
        }

        if (response.status === 401 || response.status === 403) {
          setIsLoggedIn(false)
          setAiPreviewMatches([])
          setAiPreviewStatus('guest')
          return
        }

        if (!response.ok || !isRecord(data)) {
          throw new Error('Failed to load AI recommendations.')
        }

        const sourceProductsCount = toNumber(data.source_products_count)
        const recommendationRows = Array.isArray(data.recommendations) ? data.recommendations : []

        if (sourceProductsCount === 0) {
          setAiPreviewMatches([])
          setAiPreviewStatus('no-products')
          return
        }

        const matches = recommendationRows
          .filter(isRecord)
          .map(mapAiPreviewMatch)
          .filter((match): match is AiPreviewMatch => match !== null)
          .slice(0, 3)

        setAiPreviewMatches(matches)
        setAiPreviewStatus(matches.length > 0 ? 'ready' : 'no-matches')
      } catch {
        if (!cancelled) {
          setAiPreviewMatches([])
          setAiPreviewStatus('error')
        }
      }
    }

    loadAiPreview()

    return () => {
      cancelled = true
    }
  }, [])

  const handleToggleFeaturedSaved = async (productId: string) => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch(`${API_BASE_URL}/products/${productId}/save`, {
      method: 'POST',
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
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
      return
    }

    const result = isRecord(data) ? data : {}
    const nextIsSaved = typeof result.is_saved === 'boolean'
      ? result.is_saved
      : !featuredSavedStates[productId]
    const nextSavedCount = typeof result.saved_count === 'number'
      ? result.saved_count
      : featuredProducts.find(product => product.id === productId)?.savedCount ?? 0

    setFeaturedSavedStates(current => ({ ...current, [productId]: nextIsSaved }))
    setFeaturedProducts(current =>
      current.map(product =>
        product.id === productId
          ? { ...product, savedCount: nextSavedCount }
          : product
      )
    )

    return { isSaved: nextIsSaved, savedCount: nextSavedCount }
  }

  const handleToggleLatestSaved = async (productId: string) => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch(`${API_BASE_URL}/products/${productId}/save`, {
      method: 'POST',
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
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
      return
    }

    const result = isRecord(data) ? data : {}
    const nextIsSaved = typeof result.is_saved === 'boolean'
      ? result.is_saved
      : !latestSavedStates[productId]
    const nextSavedCount = typeof result.saved_count === 'number'
      ? result.saved_count
      : latestProducts.find(product => product.id === productId)?.savedCount ?? 0

    setLatestSavedStates(current => ({ ...current, [productId]: nextIsSaved }))
    setLatestProducts(current =>
      current.map(product =>
        product.id === productId
          ? { ...product, savedCount: nextSavedCount }
          : product
      )
    )

    return { isSaved: nextIsSaved, savedCount: nextSavedCount }
  }

  const stats = [
    { value: homeStats.totalProducts.toLocaleString(), label: 'Products listed' },
    { value: homeStats.registeredUsers.toLocaleString(), label: 'Registered users' },
    { value: homeStats.completedSwaps.toLocaleString(), label: 'Swaps completed' },
    { value: homeStats.averageRating > 0 ? homeStats.averageRating.toFixed(1) : '0', label: 'Average rating', isRating: true },
  ]

  const aiPreviewReasons = aiPreviewMatches[0]?.reasons.slice(0, 4) ?? []
  const aiPreviewCta = aiPreviewStatus === 'guest'
    ? { href: '/login', label: 'Login to get AI recommendations' }
    : aiPreviewStatus === 'no-products'
      ? { href: '/user/products/new', label: 'List a product' }
      : { href: '/user/ai-matches', label: 'View all AI matches' }
  const aiPreviewMessage = aiPreviewStatus === 'guest'
    ? 'Login to get AI recommendations'
    : aiPreviewStatus === 'no-products'
      ? 'List a product to unlock AI recommendations'
      : aiPreviewStatus === 'no-matches'
        ? 'No recommendations found yet'
        : aiPreviewStatus === 'error'
          ? 'AI recommendations are unavailable right now'
          : ''

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-teal-900 to-brand-900 text-white">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />

        <div className="page-container relative py-20 lg:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <Badge className="mb-6 bg-white/10 text-white border-white/20 backdrop-blur-sm text-sm px-4 py-1.5">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI-Powered Product Exchange
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Trade smarter.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-teal-300">
                Save more.
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-white/70 mb-8 max-w-2xl mx-auto leading-relaxed">
              Swap what you have. Get what you want &mdash; smart, safe, and verified.
            </p>

            {/* Search bar */}
            <div className="flex items-center gap-2 bg-white rounded-xl p-1.5 max-w-xl mx-auto shadow-xl">
              <Search className="h-5 w-5 text-muted-foreground ml-2 shrink-0" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="What are you looking for?"
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none py-1.5"
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    window.location.href = `/marketplace?q=${encodeURIComponent(searchQuery)}`
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (searchQuery.trim()) window.location.href = `/marketplace?q=${encodeURIComponent(searchQuery)}`
                  else window.location.href = '/marketplace'
                }}
              >
                Search
              </Button>
            </div>

            {/* Quick category pills */}
            {heroCategories.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                {heroCategories.map(category => (
                  <Link
                    key={category.name}
                    href={`/marketplace?category=${encodeURIComponent(category.name)}`}
                    className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/20 text-white/80"
                  >
                    {CATEGORY_ICONS[category.name] || DEFAULT_CATEGORY_ICON} {category.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 40L1440 40L1440 20C1440 20 1080 0 720 0C360 0 0 20 0 20L0 40Z" fill="hsl(var(--background))" />
          </svg>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-b border-border bg-background">
        <div className="page-container py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
            {stats.map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold gradient-text">
                  {stat.isRating ? (
                    <span className="inline-flex items-center justify-center gap-1">
                      {stat.value}
                      <span aria-hidden="true" className="leading-none">&#9733;</span>
                    </span>
                  ) : (
                    stat.value
                  )}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      {featuredProducts.length > 0 && (
        <section className="page-container py-14">
          <div className="flex items-center justify-between mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Featured</span>
              </div>
              <h2 className="text-2xl font-bold">Featured products</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/marketplace?featured=true">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                owner={featuredOwnerMap[product.ownerId]}
                showOwner
                isSaved={featuredSavedStates[product.id]}
                onToggleSaved={handleToggleFeaturedSaved}
              />
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      <section className="bg-muted/40 border-y border-border">
        <div className="page-container py-14">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Browse by category</h2>
            <p className="text-muted-foreground">Browse available and recently swapped products by category</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {PRODUCT_CATEGORIES.map(cat => (
              <Link
                key={cat.id}
                href={`/marketplace?category=${encodeURIComponent(cat.name)}`}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary/30 hover:shadow-card-hover transition-all text-center group"
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {CATEGORY_ICONS[cat.name] || DEFAULT_CATEGORY_ICON}
                </span>
                <span className="text-xs font-medium leading-tight">{cat.name}</span>
                <span className="text-[11px] text-muted-foreground">{(categoryCounts[cat.name] || 0).toLocaleString()}</span>
              </Link>
            ))}
          </div>
          <div className="text-center mt-6">
            <Button asChild variant="outline">
              <Link href="/categories">View all categories</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* AI Matching Preview */}
      <section id="ai-matching" className="page-container py-14">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Badge className="mb-4 bg-purple-50 text-purple-700 border-purple-200">
              <Sparkles className="h-3.5 w-3.5 mr-1" /> AI-Powered
            </Badge>
            <h2 className="text-3xl font-bold mb-4 leading-tight">
              Smart matching finds your perfect swap
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Our AI analyses category, condition, location, and estimated value to find you the
              best swap partners. The higher the match score, the better the deal for both sides.
            </p>
            {aiPreviewReasons.length > 0 && (
              <ul className="space-y-3 mb-7">
                {aiPreviewReasons.map(reason => (
                  <li key={reason} className="flex items-center gap-2.5 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild>
              <Link href={aiPreviewCta.href}>{aiPreviewCta.label}</Link>
            </Button>
          </div>

          {/* Match cards preview */}
          <div className="space-y-3">
            {aiPreviewStatus === 'loading' && [0, 1, 2].map(item => (
              <div key={item} className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border">
                <div className="h-14 w-14 rounded-lg shrink-0 bg-muted animate-pulse" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                </div>
                <div className="h-8 w-14 rounded-full bg-muted animate-pulse" />
              </div>
            ))}

            {aiPreviewStatus === 'ready' && aiPreviewMatches.map(match => {
              const image = match.product.images[0]
              const reasonText = match.reasons.slice(0, 3).join(' - ')

              return (
                <Link key={match.id} href={`/products/${match.product.id}`} className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-card transition-shadow">
                  <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-muted">
                    {image ? (
                      <img src={image} alt={match.product.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{match.product.title}</p>
                    {reasonText && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{reasonText}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                      {match.product.estimatedValue > 0 && (
                        <span>{match.product.estimatedValue.toLocaleString()} EGP</span>
                      )}
                      {match.ownerRatingCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {match.ownerRating.toFixed(1)}
                        </span>
                      )}
                      {match.ownerTrustScore > 0 && (
                        <span>{match.ownerTrustScore}% trust</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center">
                    <div className={cn(
                      'text-sm font-bold px-2.5 py-1 rounded-full',
                      match.score >= 90 ? 'bg-green-100 text-green-700' :
                      match.score >= 80 ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    )}>
                      {match.score}%
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">match</p>
                  </div>
                </Link>
              )
            })}

            {aiPreviewStatus !== 'loading' && aiPreviewStatus !== 'ready' && (
              <div className="p-6 bg-card rounded-xl border border-border text-center">
                <div className="mx-auto mb-3 h-11 w-11 rounded-full bg-purple-50 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <p className="font-medium text-sm">{aiPreviewMessage}</p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href={aiPreviewCta.href}>{aiPreviewCta.label}</Link>
                </Button>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-muted/40 border-y border-border">
        <div className="page-container py-14">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">How Swap & Save works</h2>
            <p className="text-muted-foreground">Four simple steps to your next swap</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 lg:gap-5">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative">
                <div className="bg-card rounded-xl border border-border p-4 h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-primary/50">{step}</span>
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold mb-1.5 leading-snug">{title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
                {step !== '06' && (
                  <div className="hidden lg:flex absolute left-full top-1/2 z-10 w-5 -translate-y-1/2 items-center justify-center text-muted-foreground/40 pointer-events-none">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent listings */}
      <section className="page-container py-14">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h2 className="text-2xl font-bold">Latest listings</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Fresh items added recently</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/marketplace?sort=newest">Browse all <ChevronRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        {latestProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {latestProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                owner={latestOwnerMap[product.ownerId]}
                showOwner
                isSaved={latestSavedStates[product.id]}
                onToggleSaved={handleToggleLatestSaved}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card py-10 text-center">
            <p className="font-medium text-muted-foreground">No listings yet</p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/marketplace">Browse marketplace</Link>
            </Button>
          </div>
        )}
      </section>

      {/* Trust section */}
      <section id="trust-safety" className="bg-gradient-to-br from-brand-950 to-teal-900 text-white">
        <div className="page-container py-14">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-2">Built for trust and safety</h2>
            <p className="text-white/60">Every feature is designed to protect you</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TRUST_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-5 rounded-xl bg-white/10 border border-white/10">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{title}</h3>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="page-container py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to start swapping?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          List an item, find a match, and complete protected swaps through the platform.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button asChild size="lg">
            <Link href={isLoggedIn ? '/user/products/new' : '/signup'}>
              {isLoggedIn ? 'List an item' : 'Create free account'}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/marketplace">Browse marketplace</Link>
          </Button>
        </div>
        {!isLoggedIn && (
          <p className="text-xs text-muted-foreground mt-4">50 welcome coins included</p>
        )}
      </section>
    </div>
  )
}
