'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, LayoutGrid, List, Pencil, Trash2, Sparkles,
  Eye, Heart, ArrowLeftRight, Package, MoreVertical,
  Star, TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProductStatusBadge, ConditionBadge } from '@/components/shared/status-badges'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/primitives'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import type { Product, ProductCondition, ProductStatus } from '@/types'

export default function MyProductsPage() {
  const { getCurrentUser, updateUser } = useApp()
  const router = useRouter()
  const user = getCurrentUser()!
  const userId = user.id

  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

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

    const mapProduct = (item: any): Product => ({
      id: String(item.id ?? item._id ?? ''),
      ownerId: String(item.owner_id ?? item.ownerId ?? userId),
      title: item.title ?? '',
      description: item.description ?? '',
      category: item.category ?? '',
      subcategory: item.subcategory ?? '',
      condition: (item.condition ?? 'good') as ProductCondition,
      estimatedValue: Number(item.estimated_value ?? item.estimatedValue ?? 0),
      location: item.location ?? '',
      images: Array.isArray(item.images) ? item.images.filter((image: unknown): image is string => typeof image === 'string') : [],
      tags: Array.isArray(item.tags) ? item.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
      status: normalizeProductStatus(item.status),
      isFeatured: Boolean(item.is_featured ?? item.isFeatured ?? false),
      featuredUntil: item.featured_until ?? item.featuredUntil,
      viewCount: Number(item.view_count ?? item.viewCount ?? 0),
      savedCount: Number(item.saved_count ?? item.savedCount ?? 0),
      createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
      updatedAt: item.updated_at ?? item.updatedAt ?? item.created_at ?? item.createdAt ?? new Date().toISOString(),
    })

    const loadProducts = async () => {
      try {
        setLoading(true)
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

          const message =
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to load your products.'

          throw new Error(message)
        }

        const items = Array.isArray(data)
          ? data
          : typeof data === 'object' &&
              data !== null &&
              'products' in data &&
              Array.isArray(data.products)
            ? data.products
            : []

        if (!cancelled) {
          setProducts(items.map(mapProduct))
        }
      } catch (error) {
        if (!cancelled) {
          setProducts([])
          toast.error(error instanceof Error ? error.message : 'Network error while loading products.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProducts()

    return () => {
      cancelled = true
    }
  }, [router, userId])

  const filtered = products.filter(p => filter === 'all' || p.status === filter)

  const handleDelete = (id: string) => {
    const deleteProductRequest = async () => {
      const product = products.find(item => item.id === id)
      if (product?.status === 'swapped') {
        toast.error('Swapped products are read-only.')
        return
      }

      const response = await fetch(`${API_BASE_URL}/products/${id}`, {
        method: 'DELETE',
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

        const message =
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to delete product.'

        throw new Error(message)
      }

      setProducts(current => current.filter(product => product.id !== id))
      setDeleteTarget(null)
      toast.success('Product deleted')
    }

    deleteProductRequest().catch(error => {
      toast.error(error instanceof Error ? error.message : 'Network error while deleting product.')
    })
  }

  const handleFeatureProduct = (id: string, currently: boolean) => {
    const featureProductRequest = async () => {
      const product = products.find(item => item.id === id)
      if (product?.status === 'swapped') {
        toast.error('Swapped products cannot be edited.')
        return
      }

      if (currently) {
        toast.info('This product is already featured.')
        return
      }

      const response = await fetch(`${API_BASE_URL}/products/${id}/feature`, {
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

        const message =
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to feature product.'

        throw new Error(message)
      }

      const responseProduct =
        typeof data === 'object' && data !== null && 'product' in data
          ? (data as { product?: { is_featured?: boolean; featured_until?: string } }).product
          : undefined
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

      if (wallet) {
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

      setProducts(current => current.map(product =>
        product.id === id
          ? {
              ...product,
              isFeatured: Boolean(responseProduct?.is_featured ?? true),
              featuredUntil: responseProduct?.featured_until ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }
          : product
      ))

      toast.success('Product featured for 30 days. 10 coins spent.')
    }

    featureProductRequest().catch(error => {
      toast.error(error instanceof Error ? error.message : 'Network error while featuring product.')
    })
  }

  const STATUS_FILTERS = ['all', 'active', 'pending', 'swapped', 'inactive']

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Products</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{products.length} total listings</p>
        </div>
        <Button asChild>
          <Link href="/user/products/new"><Plus className="h-4 w-4" /> Add product</Link>
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', count: products.filter(p => p.status === 'active').length, color: 'text-green-600 bg-green-50 border-green-200' },
          { label: 'Pending', count: products.filter(p => p.status === 'pending').length, color: 'text-amber-600 bg-amber-50 border-amber-200' },
          { label: 'Swapped', count: products.filter(p => p.status === 'swapped').length, color: 'text-blue-600 bg-blue-50 border-blue-200' },
          { label: 'Featured', count: products.filter(p => p.isFeatured).length, color: 'text-purple-600 bg-purple-50 border-purple-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.color}`}>
            <p className="text-xl font-bold">{s.count}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-sm capitalize transition-colors',
                filter === f ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
              )}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
          <button onClick={() => setView('grid')} className={cn('p-1.5 rounded transition-colors', view === 'grid' ? 'bg-muted' : 'hover:bg-muted')}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setView('list')} className={cn('p-1.5 rounded transition-colors', view === 'list' ? 'bg-muted' : 'hover:bg-muted')}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading products...
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-border rounded-2xl">
          <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-muted-foreground">
            {filter === 'all' ? 'No products yet' : `No ${filter} products`}
          </p>
          {filter === 'all' && (
            <>
              <p className="text-sm text-muted-foreground mt-1 mb-5">List your first item and start swapping</p>
              <Button asChild><Link href="/user/products/new"><Plus className="h-4 w-4" /> Add your first product</Link></Button>
            </>
          )}
        </div>
      )}

      {/* Grid view */}
      {!loading && view === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <div key={product.id} className="bg-card rounded-xl border border-border overflow-hidden group">
              {/* Image */}
              <div className="relative h-44 bg-muted overflow-hidden">
                {product.images[0]
                  ? <img src={product.images[0]} alt={product.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  : <div className="flex h-full items-center justify-center"><Package className="h-10 w-10 text-muted-foreground/30" /></div>
                }
                {product.isFeatured && (
                  <div className="absolute top-2 left-2">
                    <Badge variant="featured" className="gap-1 text-xs"><Sparkles className="h-3 w-3" />Featured</Badge>
                  </div>
                )}
                {/* Quick actions overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ProductActionsMenu
                    product={product}
                    onDelete={() => setDeleteTarget(product.id)}
                    onToggleFeatured={() => handleFeatureProduct(product.id, product.isFeatured)}
                  />
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ProductStatusBadge status={product.status} />
                  <ConditionBadge condition={product.condition} />
                </div>
                <h3 className="font-medium text-sm line-clamp-2 mb-1">{product.title}</h3>
                <p className="text-sm font-bold text-primary">~{product.estimatedValue.toLocaleString()} EGP</p>

                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{product.viewCount}</span>
                    <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{product.savedCount}</span>
                  </div>
                  <span>{format(new Date(product.createdAt), 'MMM d')}</span>
                </div>

                <div className="flex gap-2 mt-3">
                  {product.status === 'swapped' ? (
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href={`/products/${product.id}`}><Eye className="h-3.5 w-3.5" />View public</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <Link href={`/user/products/${product.id}/edit`}><Pencil className="h-3.5 w-3.5" />Edit</Link>
                      </Button>
                      <Button
                        variant={product.isFeatured ? 'default' : 'outline'}
                        size="sm"
                        className="flex-1"
                        disabled={product.isFeatured}
                        onClick={() => handleFeatureProduct(product.id, product.isFeatured)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {product.isFeatured ? 'Featured' : 'Feature'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {!loading && view === 'list' && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(product => (
            <div key={product.id} className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-card transition-shadow">
              <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-muted">
                {product.images[0]
                  ? <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full items-center justify-center"><Package className="h-6 w-6 text-muted-foreground/30" /></div>
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-medium text-sm truncate">{product.title}</span>
                  {product.isFeatured && <Badge variant="featured" className="text-[10px] gap-0.5 px-1.5"><Sparkles className="h-2.5 w-2.5" />Featured</Badge>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ProductStatusBadge status={product.status} />
                  <ConditionBadge condition={product.condition} />
                  <span className="text-xs text-primary font-semibold">~{product.estimatedValue.toLocaleString()} EGP</span>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{product.viewCount}</span>
                <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{product.savedCount}</span>
                <span>{format(new Date(product.createdAt), 'MMM d, yyyy')}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {product.status === 'swapped' ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/products/${product.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/user/products/${product.id}/edit`}><Pencil className="h-3.5 w-3.5" /></Link>
                  </Button>
                )}
                <ProductActionsMenu
                  product={product}
                  onDelete={() => setDeleteTarget(product.id)}
                  onToggleFeatured={() => handleFeatureProduct(product.id, product.isFeatured)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>
              This will permanently remove this listing only if it is not involved in any swaps. Swap-linked products are kept to preserve history.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ProductActionsMenuProps = {
  product: Product
  onDelete: () => void
  onToggleFeatured: () => void
}

function ProductActionsMenu({ product, onDelete, onToggleFeatured }: ProductActionsMenuProps) {
  const isSwapped = product.status === 'swapped'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isSwapped && (
          <DropdownMenuItem asChild>
            <Link href={`/user/products/${product.id}/edit`} className="cursor-pointer">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/products/${product.id}`} className="cursor-pointer">
            <Eye className="h-4 w-4" /> View public
          </Link>
        </DropdownMenuItem>
        {!isSwapped && (
          <>
        <DropdownMenuItem onClick={onToggleFeatured} disabled={product.isFeatured}>
          <Sparkles className="h-4 w-4" /> {product.isFeatured ? 'Featured' : 'Feature (10 coins)'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
