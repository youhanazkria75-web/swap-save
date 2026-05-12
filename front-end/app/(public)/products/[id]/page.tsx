'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeftRight, MapPin, Star, Eye, Heart, Share2, Flag,
  ShieldCheck, CheckCircle2, ChevronLeft, ChevronRight,
  Sparkles, MessageSquare, Package, User as UserIcon, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/form-elements'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/primitives'
import { ConditionBadge, ProductStatusBadge, TrustBadge } from '@/components/shared/status-badges'
import { ProductCard } from '@/components/shared/product-card'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Product, ProductCondition, ProductStatus, TrustLevel, User } from '@/types'

const normalizeProductStatus = (status: unknown): ProductStatus => {
  switch (status) {
    case 'available':
    case 'active':
      return 'active'
    case 'reserved':
      return 'reserved'
    case 'pending':
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

const trustLevelFromScore = (score: number, isSuspended = false): TrustLevel => {
  if (isSuspended) return 'risky'
  if (score >= 70) return 'trusted'
  if (score >= 30) return 'new'
  return 'risky'
}

const mapProduct = (item: Record<string, unknown>): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId: String(item.owner_id ?? item.ownerId ?? ''),
  title: typeof item.title === 'string' ? item.title : '',
  description: typeof item.description === 'string' ? item.description : '',
  category: typeof item.category === 'string' ? item.category : '',
  subcategory: typeof item.subcategory === 'string' ? item.subcategory : '',
  condition: (typeof item.condition === 'string' ? item.condition : 'good') as ProductCondition,
  estimatedValue: Number(item.estimated_value ?? item.estimatedValue ?? 0),
  location: typeof item.location === 'string' ? item.location : '',
  images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
  tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  status: normalizeProductStatus(item.status),
  isFeatured: Boolean(item.is_featured ?? item.isFeatured ?? false),
  featuredUntil: typeof item.featured_until === 'string' ? item.featured_until : typeof item.featuredUntil === 'string' ? item.featuredUntil : undefined,
  viewCount: Number(item.view_count ?? item.viewCount ?? 0),
  savedCount: Number(item.saved_count ?? item.savedCount ?? 0),
  isSaved: Boolean(item.is_saved ?? item.isSaved ?? false),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
})

const mapOwner = (item: Record<string, unknown>): User => {
  const completedSwaps = Number(item.completedSwaps ?? item.completed_swaps ?? 0)
  const isSuspended = Boolean(item.isSuspended ?? item.is_suspended)
  const trustScore = Number(item.trustScore ?? item.trust_score ?? 0)

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
    isEmailVerified: Boolean(item.isEmailVerified),
    isPhoneVerified: Boolean(item.isPhoneVerified),
    isAdmin: Boolean(item.role === 'admin' || item.isAdmin),
    trustLevel: trustLevelFromScore(trustScore, isSuspended),
    trustScore,
    completedSwaps,
    totalSwaps: Number(item.totalSwaps ?? item.total_swaps ?? completedSwaps),
    rating: Number(item.rating ?? 0),
    ratingCount: Number(item.ratingCount ?? item.rating_count ?? 0),
    coinBalance: Number(item.coinBalance ?? item.coin_balance ?? 0),
    featuredSlotsUsed: Number(item.featuredSlotsUsed ?? item.featured_slots_used ?? 0),
    profileCompleteness: Number(item.profileCompleteness ?? item.profile_completeness ?? 0),
    isSuspended,
    suspendedReason: typeof item.suspendedReason === 'string' ? item.suspendedReason : undefined,
    lastActiveAt: typeof item.lastActiveAt === 'string' ? item.lastActiveAt : new Date().toISOString(),
  }
}

export default function ProductDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const {
    isAuthenticated, getCurrentUser,
  } = useApp()
  const currentUser = getCurrentUser()

  const [imgIdx, setImgIdx] = useState(0)
  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [message, setMessage] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState<Product | null>(null)
  const [owner, setOwner] = useState<User | null>(null)
  const [ownerProducts, setOwnerProducts] = useState<Product[]>([])
  const [myActiveProducts, setMyActiveProducts] = useState<Product[]>([])
  const [isSaved, setIsSaved] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [reportingProduct, setReportingProduct] = useState(false)
  const viewRequestStartedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const loadPublicProduct = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/products/${id}/public`, {
          headers: localStorage.getItem('token')
            ? {
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
              }
            : undefined,
        })
        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          throw new Error(
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to load product.'
          )
        }

        if (
          typeof data !== 'object' ||
          data === null ||
          !('product' in data) ||
          !('owner' in data)
        ) {
          throw new Error('Invalid product response.')
        }

        const payload = data as {
          product: Record<string, unknown>
          owner: Record<string, unknown>
          ownerProducts?: Record<string, unknown>[]
          is_saved?: boolean
        }

        if (!cancelled) {
          const mappedProduct = mapProduct(payload.product)
          setProduct(mappedProduct)
          setOwner(mapOwner(payload.owner))
          setOwnerProducts(Array.isArray(payload.ownerProducts) ? payload.ownerProducts.map(mapProduct) : [])
          setIsSaved(Boolean(payload.is_saved))
          setImgIdx(0)
        }
      } catch (error) {
        if (!cancelled) {
          setProduct(null)
          setOwner(null)
          setOwnerProducts([])
          toast.error(error instanceof Error ? error.message : 'Network error while loading product.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPublicProduct()

    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!product) return
    if (currentUser?.id === product.ownerId) return

    const viewerScope = currentUser?.id || 'guest'
    const viewGuardKey = `product-view-counted:${id}:${viewerScope}`
    const guestSessionStorageKey = 'guest-product-view-session-id'

    if (sessionStorage.getItem(viewGuardKey) || viewRequestStartedRef.current) {
      return
    }

    let cancelled = false

    const incrementView = async () => {
      viewRequestStartedRef.current = true

      const token = localStorage.getItem('token') || ''
      let guestSessionId = ''

      if (!token) {
        guestSessionId = sessionStorage.getItem(guestSessionStorageKey) || crypto.randomUUID()
        sessionStorage.setItem(guestSessionStorageKey, guestSessionId)
      }

      sessionStorage.setItem(viewGuardKey, 'pending')

      try {
        const response = await fetch(`${API_BASE_URL}/products/${id}/view`, {
          method: 'POST',
          headers: {
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(!token ? { 'X-View-Session-Id': guestSessionId } : {}),
          },
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) return

        const nextViewCount =
          typeof data === 'object' &&
          data !== null &&
          'view_count' in data &&
          typeof data.view_count === 'number'
            ? data.view_count
            : null

        if (!cancelled && nextViewCount !== null) {
          sessionStorage.setItem(viewGuardKey, 'counted')
          setProduct(current => current ? { ...current, viewCount: nextViewCount } : current)
        }
      } catch {
        sessionStorage.removeItem(viewGuardKey)
        // Ignore view count update errors and keep page usable.
      } finally {
        viewRequestStartedRef.current = false
      }
    }

    incrementView()

    return () => {
      cancelled = true
    }
  }, [currentUser?.id, id, product])

  useEffect(() => {
    if (!isAuthenticated) {
      setMyActiveProducts([])
      return
    }

    let cancelled = false

    const loadMyProducts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/products/mine`, {
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
              : 'Failed to load your products.'
          )
        }

        const items =
          typeof data === 'object' &&
          data !== null &&
          'products' in data &&
          Array.isArray(data.products)
            ? data.products
            : []

        if (!cancelled) {
          setMyActiveProducts(items.map(item => mapProduct(item)).filter(item => item.status === 'active'))
        }
      } catch (error) {
        if (!cancelled) {
          setMyActiveProducts([])
        }
      }
    }

    loadMyProducts()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, router])

  const isOwner = currentUser?.id === product?.ownerId
  const isProductSwappable = product?.status === 'active'

  const handleToggleSaved = async () => {
    if (isOwner) {
      toast.info('You cannot save your own product.')
      return
    }

    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (savingProduct || !product) return

    try {
      setSavingProduct(true)
      const response = await fetch(`${API_BASE_URL}/products/${product.id}/save`, {
        method: 'POST',
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
            : 'Failed to update saved status.'
        )
      }

      const nextIsSaved =
        typeof data === 'object' &&
        data !== null &&
        'is_saved' in data &&
        typeof data.is_saved === 'boolean'
          ? data.is_saved
          : !isSaved

      const nextSavedCount =
        typeof data === 'object' &&
        data !== null &&
        'saved_count' in data &&
        typeof data.saved_count === 'number'
          ? data.saved_count
          : product.savedCount

      setIsSaved(nextIsSaved)
      setProduct(current => current ? { ...current, savedCount: nextSavedCount } : current)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error while updating saved status.')
    } finally {
      setSavingProduct(false)
    }
  }

  const handleReportProduct = async () => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    if (!product || reportingProduct) return

    try {
      setReportingProduct(true)
      const response = await fetch(`${API_BASE_URL}/products/${product.id}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          reason: 'Inappropriate or inaccurate listing',
          description: `Product listing reported: ${product.title}`,
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
            : 'Failed to submit report.'
        )
      }

      toast.success('Report submitted. Our team will review it.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error while submitting report.')
    } finally {
      setReportingProduct(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container py-20 text-center text-sm text-muted-foreground">
        Loading product...
      </div>
    )
  }

  if (!product || !owner) {
    return (
      <div className="page-container py-20 text-center">
        <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-bold mb-2">Product not found</h2>
        <Button asChild variant="outline"><Link href="/marketplace">Back to marketplace</Link></Button>
      </div>
    )
  }

  const handleShareProduct = async () => {
    const shareUrl = window.location.href

    try {
      if (navigator.share) {
        await navigator.share({
          title: product.title,
          url: shareUrl,
        })
        toast.success('Product link shared.')
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      toast.success('Product link copied.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      toast.error('Unable to share this product link.')
    }
  }

  const handleSwapRequest = async () => {
    if (!isAuthenticated) { router.push('/login'); return }
    if (!isProductSwappable) {
      toast.error('This product is no longer available for swap.')
      setSwapModalOpen(false)
      return
    }
    if (!selectedProduct) { toast.error('Please select a product to offer'); return }
    setSwapping(true)
    try {
      const response = await fetch(`${API_BASE_URL}/swaps/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          product_offered: selectedProduct,
          product_requested: product.id,
          message: message.trim() || undefined,
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
            : 'Failed to send swap request.'
        )
      }

      setSwapModalOpen(false)
      toast.success('Swap request sent!', { description: `${owner.firstName} will be notified.` })
      router.push('/user/swaps')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error while sending swap request.')
    } finally {
      setSwapping(false)
    }
  }

  return (
    <div className="page-container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/marketplace" className="hover:text-foreground transition-colors">Marketplace</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/marketplace?category=${product.category}`} className="hover:text-foreground">{product.category}</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground truncate max-w-48">{product.title}</span>
      </nav>

      <div className="grid lg:grid-cols-[1fr_400px] gap-8 xl:gap-12">
        {/* Left — Images + Details */}
        <div>
          {/* Image gallery */}
          <div className="relative aspect-[4/3] bg-muted rounded-2xl overflow-hidden mb-3">
            {product.images[imgIdx] ? (
              <Image
                src={product.images[imgIdx]}
                alt={product.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}
            {product.isFeatured && (
              <Badge variant="featured" className="absolute top-3 left-3 gap-1">
                <Sparkles className="h-3 w-3" /> Featured
              </Badge>
            )}
            {product.images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx(i => (i - 1 + product.images.length) % product.images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/80 flex items-center justify-center hover:bg-background shadow transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setImgIdx(i => (i + 1) % product.images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/80 flex items-center justify-center hover:bg-background shadow transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails */}
          {product.images.length > 1 && (
            <div className="flex gap-2">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setImgIdx(i)}
                  className={cn(
                    'relative h-16 w-16 rounded-lg overflow-hidden border-2 transition-colors',
                    i === imgIdx ? 'border-primary' : 'border-transparent'
                  )}
                >
                  <Image src={img} alt="" fill className="object-cover" sizes="64px" />
                </button>
              ))}
            </div>
          )}

          {/* Description */}
          <div className="mt-8">
            <h2 className="font-semibold mb-3">About this item</h2>
            <p className="text-muted-foreground leading-relaxed">{product.description}</p>
          </div>

          {/* Tags */}
          {product.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {product.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">#{tag}</Badge>
              ))}
            </div>
          )}

          {/* Details grid */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { label: 'Category', value: product.category },
              { label: 'Condition', value: product.condition.replace('-', ' ') },
              { label: 'Location', value: product.location },
              { label: 'Listed', value: format(new Date(product.createdAt), 'MMM d, yyyy') },
            ].map(({ label, value }) => (
              <div key={label} className="bg-muted/50 rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-sm font-medium capitalize">{value}</p>
              </div>
            ))}
          </div>

          {/* Other items from owner */}
          {ownerProducts.filter(p => p.id !== product.id).length > 0 && (
            <div className="mt-10">
              <h3 className="font-semibold mb-4">More from {owner.firstName}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ownerProducts.filter(p => p.id !== product.id).slice(0, 3).map(p => (
                  <ProductCard key={p.id} product={p} compact />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — Sidebar */}
        <div className="space-y-4">
          {/* Main product card */}
          <div className="bg-card rounded-2xl border border-border p-6 sticky top-20">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex gap-2 flex-wrap">
                <ConditionBadge condition={product.condition} />
                <ProductStatusBadge status={product.status} />
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost" size="icon-sm"
                  onClick={handleToggleSaved}
                  className={isSaved ? 'text-red-500' : ''}
                  disabled={savingProduct || isOwner}
                  aria-label={isOwner ? 'Cannot save your own product' : isSaved ? 'Remove from saved products' : 'Save product'}
                  title={isOwner ? 'You cannot save your own product' : isSaved ? 'Remove from saved products' : 'Save product'}
                >
                  <Heart className={cn('h-4 w-4', isSaved && 'fill-current')} />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={handleShareProduct} aria-label="Share product" title="Share product">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <h1 className="text-xl font-bold leading-snug mb-2">{product.title}</h1>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-2xl font-bold text-primary">~{product.estimatedValue.toLocaleString()} EGP</span>
              <span className="text-sm text-muted-foreground">estimated value</span>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-5">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{product.location}</span>
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{product.viewCount} views</span>
              <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{product.savedCount} saved</span>
            </div>

            {/* Swap action */}
            {isOwner ? (
              <div className="space-y-2">
                {product.status === 'swapped' ? (
                  <Button className="w-full" variant="outline" disabled>
                    Already Swapped
                  </Button>
                ) : (
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/user/products/${product.id}/edit`}>Edit this product</Link>
                  </Button>
                )}
                <p className="text-xs text-muted-foreground text-center">This is your listing</p>
              </div>
            ) : isProductSwappable ? (
              <>
                <Button
                  className="w-full mb-2"
                  size="lg"
                  onClick={() => {
                    if (!isAuthenticated) { router.push('/login'); return }
                    setSwapModalOpen(true)
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  Request a Swap
                </Button>
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Admin-reviewed · Safe & protected
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Button className="w-full" disabled>
                  {product.status === 'swapped' ? 'Already Swapped' : 'Not Available'}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  This product is no longer available for swap.
                </p>
              </div>
            )}
          </div>

          {/* Owner card */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={owner.avatar} alt={owner.firstName} />
                <AvatarFallback className="bg-brand-100 text-brand-700 font-semibold">
                  {owner.firstName[0]}{owner.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{owner.firstName} {owner.lastName}</p>
                <TrustBadge level={owner.trustLevel} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center mb-4">
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-base font-bold">{owner.completedSwaps}</p>
                <p className="text-[11px] text-muted-foreground">Swaps</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-base font-bold">{owner.rating > 0 ? owner.rating.toFixed(1) : '—'}</p>
                <p className="text-[11px] text-muted-foreground">Rating</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-2">
                <p className="text-base font-bold">{owner.trustScore}</p>
                <p className="text-[11px] text-muted-foreground">Trust</p>
              </div>
            </div>

            <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
              {owner.isEmailVerified && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Email verified
                </span>
              )}
              {owner.isPhoneVerified && (
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Phone verified
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
              <MapPin className="h-3 w-3" /> {[owner.area, owner.city, owner.country].filter(Boolean).join(', ') || 'Location not provided'}
            </div>
          </div>

          {/* Safety note */}
          <div className="bg-muted/50 rounded-xl p-4">
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium mb-1">Safe exchange guaranteed</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every swap is admin-reviewed before completion. Never share personal contact details before approval.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {isAuthenticated && !isOwner && (
              <button
                onClick={handleReportProduct}
                disabled={reportingProduct}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <Flag className="h-3.5 w-3.5" /> {reportingProduct ? 'Submitting...' : 'Report this listing'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Swap request modal */}
      <Dialog open={swapModalOpen} onOpenChange={setSwapModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request a Swap</DialogTitle>
            <DialogDescription>
              Select one of your products to offer in exchange for <strong>{product.title}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Requested product preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              <div className="h-14 w-14 rounded-lg overflow-hidden bg-muted shrink-0">
                {product.images[0] && <img src={product.images[0]} alt="" className="h-full w-full object-cover" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">You want:</p>
                <p className="font-medium text-sm">{product.title}</p>
                <p className="text-xs text-primary">~{product.estimatedValue.toLocaleString()} EGP</p>
              </div>
            </div>

            {/* Product selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">You offer:</label>
              {myActiveProducts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No active products to offer.{' '}
                  <Link href="/user/products/new" className="text-primary hover:underline">Add a product first.</Link>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {myActiveProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProduct(p.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                        selectedProduct === p.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted'
                      )}
                    >
                      <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                        {p.images[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{p.title}</p>
                        <p className="text-xs text-primary">~{p.estimatedValue.toLocaleString()} EGP</p>
                      </div>
                      {selectedProduct === p.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Message */}
            <div>
              <label className="text-sm font-medium mb-2 block">Message to {owner.firstName} (optional)</label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={`Hi ${owner.firstName}! I'd love to swap my item for your ${product.title}...`}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{message.length}/500</p>
            </div>

            {/* Safety reminder */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
              <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Do not share personal contact info before admin approval. Keep all communication on the platform.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSwapModalOpen(false)}>Cancel</Button>
              <Button
                className="flex-1"
                onClick={handleSwapRequest}
                loading={swapping}
                disabled={!selectedProduct}
              >
                Send Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
