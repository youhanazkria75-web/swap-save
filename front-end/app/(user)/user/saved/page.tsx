'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ProductGrid } from '@/components/shared/product-card'
import { API_BASE_URL as API_URL } from '@/lib/api-config'
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

const mapProduct = (item: Record<string, unknown>): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId: String(
    typeof item.owner_id === 'object' && item.owner_id !== null
      ? (item.owner_id as Record<string, unknown>)._id ?? ''
      : item.owner_id ?? item.ownerId ?? ''
  ),
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
  isSaved: Boolean(item.is_saved ?? item.isSaved ?? true),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
})

const mapOwner = (item: Record<string, unknown>): User => ({
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
  trustLevel: 'new' as TrustLevel,
  trustScore: 50,
  completedSwaps: Number(item.completedSwaps ?? item.completed_swaps ?? 0),
  totalSwaps: Number(item.totalSwaps ?? item.total_swaps ?? 0),
  rating: Number(item.rating ?? 0),
  ratingCount: Number(item.ratingCount ?? item.rating_count ?? 0),
  coinBalance: Number(item.coinBalance ?? item.coin_balance ?? 0),
  featuredSlotsUsed: Number(item.featuredSlotsUsed ?? item.featured_slots_used ?? 0),
  profileCompleteness: Number(item.profileCompleteness ?? item.profile_completeness ?? 0),
  isSuspended: Boolean(item.isSuspended ?? item.is_suspended),
  suspendedReason: typeof item.suspendedReason === 'string' ? item.suspendedReason : undefined,
  lastActiveAt: typeof item.lastActiveAt === 'string' ? item.lastActiveAt : new Date().toISOString(),
})

export default function SavedPage() {
  const router = useRouter()
  const [saved, setSaved] = useState<Product[]>([])
  const [owners, setOwners] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadSavedProducts = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_URL}/products/saved`, {
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

          throw new Error('Failed to load saved products.')
        }

        const items =
          typeof data === 'object' &&
          data !== null &&
          'products' in data &&
          Array.isArray(data.products)
            ? data.products
            : []

        if (!cancelled) {
          const mappedProducts = items.map(item => mapProduct(item as Record<string, unknown>))
          const mappedOwners = items
            .map(item => {
              const owner = (item as Record<string, unknown>).owner_id
              return typeof owner === 'object' && owner !== null
                ? mapOwner(owner as Record<string, unknown>)
                : null
            })
            .filter((owner): owner is User => owner !== null)

          setSaved(mappedProducts)
          setOwners(mappedOwners)
        }
      } catch {
        if (!cancelled) {
          setSaved([])
          setOwners([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSavedProducts()

    return () => {
      cancelled = true
    }
  }, [router])

  const ownerMap = Object.fromEntries(owners.map(u => [u.id, u]))
  const savedStates = Object.fromEntries(saved.map(product => [product.id, true]))

  const handleToggleSaved = async (productId: string) => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      router.push('/login')
      return
    }

    try {
      const response = await fetch(`${API_URL}/products/${productId}/save`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      const data: unknown = await response.json().catch(() => null)

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
          : false
      const nextSavedCount =
        typeof data === 'object' &&
        data !== null &&
        'saved_count' in data &&
        typeof data.saved_count === 'number'
          ? data.saved_count
          : saved.find(product => product.id === productId)?.savedCount ?? 0

      setSaved(current =>
        nextIsSaved
          ? current.map(product =>
              product.id === productId
                ? { ...product, savedCount: nextSavedCount, isSaved: true }
                : product
            )
          : current.filter(product => product.id !== productId)
      )

      return { isSaved: nextIsSaved, savedCount: nextSavedCount }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error while updating saved status.')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Saved Items</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{saved.length} saved products</p>
        </div>
      </div>

      {!loading && saved.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border rounded-2xl">
          <Heart className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-muted-foreground">No saved products yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Browse the marketplace and tap the heart icon to save items</p>
          <Button asChild variant="outline"><Link href="/marketplace">Browse marketplace</Link></Button>
        </div>
      ) : !loading ? (
        <ProductGrid
          products={saved}
          owners={ownerMap}
          showOwner
          savedStates={savedStates}
          onToggleSaved={handleToggleSaved}
        />
      ) : null}
    </div>
  )
}
