'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MapPin, Star, Calendar, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage, Progress } from '@/components/ui/primitives'
import { TrustBadge } from '@/components/shared/status-badges'
import { ProductCard } from '@/components/shared/product-card'
import { format } from 'date-fns'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import type { Product, ProductCondition, ProductStatus, Rating, TrustLevel, User } from '@/types'

type BackendRecord = Record<string, unknown>

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

const getBoolean = (value: unknown) => value === true || value === 'true'

const normalizeCondition = (condition: unknown): ProductCondition => {
  if (condition === 'new' || condition === 'like-new' || condition === 'good' || condition === 'fair' || condition === 'poor') {
    return condition
  }

  return 'good'
}

const normalizeProductStatus = (status: unknown): ProductStatus => {
  if (status === 'available' || status === 'active') return 'active'
  if (status === 'reserved' || status === 'swapped' || status === 'pending' || status === 'inactive' || status === 'rejected') return status
  return 'inactive'
}

const trustLevelFromScore = (score: number, isSuspended = false): TrustLevel => {
  if (isSuspended) return 'risky'
  if (score >= 70) return 'trusted'
  if (score >= 30) return 'new'
  return 'risky'
}

const formatDate = (value: string, pattern: string, fallback: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : format(date, pattern)
}

const mapUser = (item: BackendRecord): User => {
  const rating = Number(item.rating ?? 0)
  const ratingCount = Number(item.rating_count ?? item.ratingCount ?? 0)
  const completedSwaps = Number(item.completed_swaps ?? item.completedSwaps ?? 0)
  const trustScore = Number(item.trust_score ?? item.trustScore ?? 0)

  return {
    id: String(item._id ?? item.id ?? ''),
    firstName: getString(item, 'first_name', 'firstName'),
    lastName: getString(item, 'last_name', 'lastName'),
    email: getString(item, 'email'),
    phone: typeof item.phone === 'string' ? item.phone : undefined,
    avatar: typeof item.avatar === 'string' ? item.avatar : undefined,
    country: getString(item, 'country'),
    city: getString(item, 'city'),
    area: getString(item, 'area'),
    streetAddress: undefined,
    bio: typeof item.bio === 'string' ? item.bio : undefined,
    joinedAt: getString(item, 'createdAt'),
    isEmailVerified: getBoolean(item.isEmailVerified ?? item.is_email_verified),
    isPhoneVerified: getBoolean(item.isPhoneVerified ?? item.is_phone_verified),
    isAdmin: item.role === 'admin' || Boolean(item.isAdmin ?? item.is_admin),
    trustLevel: trustLevelFromScore(trustScore, Boolean(item.isSuspended ?? item.is_suspended)),
    trustScore,
    completedSwaps,
    totalSwaps: Number(item.total_swaps ?? item.totalSwaps ?? completedSwaps),
    rating,
    ratingCount,
    coinBalance: Number(item.coin_balance ?? item.coinBalance ?? 0),
    featuredSlotsUsed: Number(item.featured_slots_used ?? item.featuredSlotsUsed ?? 0),
    profileCompleteness: Number(item.profile_completeness ?? item.profileCompleteness ?? 0),
    isSuspended: Boolean(item.isSuspended ?? item.is_suspended),
    suspendedReason: typeof item.suspended_reason === 'string' ? item.suspended_reason : undefined,
    lastActiveAt: getString(item, 'lastActiveAt', 'last_active_at', 'updatedAt'),
  }
}

const mapProduct = (item: BackendRecord): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId: getId(item.owner_id ?? item.ownerId),
  title: getString(item, 'title'),
  description: getString(item, 'description'),
  category: getString(item, 'category'),
  subcategory: getString(item, 'subcategory') || undefined,
  condition: normalizeCondition(item.condition),
  estimatedValue: Number(item.estimated_value ?? item.estimatedValue ?? 0),
  location: getString(item, 'location'),
  images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  status: normalizeProductStatus(item.status),
  isFeatured: Boolean(item.is_featured ?? item.isFeatured),
  featuredUntil: getString(item, 'featured_until', 'featuredUntil') || undefined,
  viewCount: Number(item.view_count ?? item.viewCount ?? 0),
  savedCount: Number(item.saved_count ?? item.savedCount ?? 0),
  isSaved: Boolean(item.is_saved ?? item.isSaved),
  createdAt: getString(item, 'createdAt', 'created_at'),
  updatedAt: getString(item, 'updatedAt', 'updated_at'),
})

const mapRating = (item: BackendRecord): Rating => ({
  id: String(item._id ?? item.id ?? ''),
  swapId: getId(item.swap ?? item.swapId),
  raterId: getId(item.rater ?? item.raterId),
  ratedUserId: getId(item.rated_user ?? item.ratedUserId),
  score: Number(item.score ?? 0),
  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  comment: getString(item, 'comment'),
  createdAt: getString(item, 'createdAt', 'created_at'),
})

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [profileUser, setProfileUser] = useState<User | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [ratings, setRatings] = useState<Rating[]>([])
  const [raters, setRaters] = useState<Record<string, User>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('token') || ''
        const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const data = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'User not found'
          )
        }

        if (cancelled || typeof data !== 'object' || data === null) return

        const payload = data as BackendRecord
        const userRaw = typeof payload.user === 'object' && payload.user !== null ? payload.user as BackendRecord : null
        const rawProducts = Array.isArray(payload.products) ? payload.products as BackendRecord[] : []
        const rawRatings = Array.isArray(payload.ratings) ? payload.ratings as BackendRecord[] : []

        if (!userRaw) {
          throw new Error('User not found')
        }

        const mappedRatings = rawRatings.map(mapRating)
        const mappedRaters: Record<string, User> = {}
        rawRatings.forEach((rating) => {
          if (typeof rating.rater === 'object' && rating.rater !== null) {
            const rater = mapUser(rating.rater as BackendRecord)
            if (rater.id) mappedRaters[rater.id] = rater
          }
        })

        setProfileUser(mapUser(userRaw))
        setProducts(rawProducts.map(mapProduct).filter(product => product.status === 'active'))
        setRatings(mappedRatings)
        setRaters(mappedRaters)
      } catch {
        if (!cancelled) {
          setProfileUser(null)
          setProducts([])
          setRatings([])
          setRaters({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="page-container py-20 text-center">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    )
  }

  if (!profileUser || profileUser.isAdmin) {
    return (
      <div className="page-container py-20 text-center">
        <p className="text-muted-foreground">User not found</p>
        <Button asChild variant="outline" className="mt-4"><Link href="/marketplace">Back to marketplace</Link></Button>
      </div>
    )
  }

  const initials = `${profileUser.firstName[0] || ''}${profileUser.lastName[0] || ''}`.toUpperCase() || '?'

  return (
    <div className="page-container py-10 max-w-5xl mx-auto">
      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-6 text-center">
            <Avatar className="h-20 w-20 mx-auto mb-3">
              <AvatarImage src={profileUser.avatar} />
              <AvatarFallback className="text-xl font-bold bg-brand-100 text-brand-700">{initials}</AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-bold">{profileUser.firstName} {profileUser.lastName}</h1>
            <div className="flex justify-center items-center gap-2 mt-2 mb-3">
              <TrustBadge level={profileUser.trustLevel} />
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {profileUser.bio || 'Bio not provided'}
            </p>

            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-4">
              <MapPin className="h-3.5 w-3.5" />
              {[profileUser.area, profileUser.city, profileUser.country].filter(Boolean).join(', ') || 'Location not provided'}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Swaps', value: profileUser.completedSwaps },
                { label: 'Rating', value: profileUser.rating > 0 ? profileUser.rating.toFixed(1) : '—' },
                { label: 'Trust', value: profileUser.trustScore },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/50 rounded-xl p-2.5">
                  <p className="text-base font-bold">{value}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Calendar className="h-3 w-3" />
              Member since {formatDate(profileUser.joinedAt, 'MMMM yyyy', 'unavailable')}
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Trust score</span>
              <span className="font-bold text-primary">{profileUser.trustScore}/100</span>
            </div>
            <Progress value={profileUser.trustScore} className="h-2" />
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">
                Active listings
                <span className="text-muted-foreground font-normal text-sm ml-2">({products.length})</span>
              </h2>
            </div>
            {products.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active listings</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {products.map(product => <ProductCard key={product.id} product={product} compact />)}
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-lg mb-4">
              Ratings & reviews
              <span className="text-muted-foreground font-normal text-sm ml-2">({ratings.length})</span>
            </h2>

            {ratings.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No ratings yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-4xl font-bold">{profileUser.rating.toFixed(1)}</p>
                    <div className="flex justify-center mt-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} className={cn('h-4 w-4', star <= Math.round(profileUser.rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{profileUser.ratingCount} reviews</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    {[5, 4, 3, 2, 1].map(star => {
                      const count = ratings.filter(rating => Math.round(rating.score) === star).length
                      const pct = ratings.length ? (count / ratings.length) * 100 : 0
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-right text-muted-foreground">{star}</span>
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-4 text-muted-foreground">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {ratings.map(rating => {
                  const rater = raters[rating.raterId]
                  return (
                    <div key={rating.id} className="bg-card rounded-xl border border-border p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={rater?.avatar} />
                          <AvatarFallback className="text-xs">{rater?.firstName?.[0] || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {rater ? `${rater.firstName} ${rater.lastName}` : 'Deleted user'}
                          </p>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} className={cn('h-3 w-3', star <= rating.score ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
                            ))}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(rating.createdAt, 'MMM d, yyyy', 'Date unavailable')}</span>
                      </div>
                      {rating.comment && <p className="text-sm text-muted-foreground">{rating.comment}</p>}
                      {rating.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {rating.tags.map(tag => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border capitalize">
                              {tag.replace('-', ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
