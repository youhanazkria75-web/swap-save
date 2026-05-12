'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Sparkles, Package, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form-elements'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProductCard } from '@/components/shared/product-card'
import { API_BASE_URL } from '@/lib/api-config'
import { PRODUCT_CATEGORIES } from '@/lib/product-categories'
import { cn } from '@/lib/utils'
import type { Product, ProductCondition, ProductFilters, ProductStatus, TrustLevel, User } from '@/types'

const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor']
const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest first' },
  { value: 'value-asc',  label: 'Value: Low → High' },
  { value: 'value-desc', label: 'Value: High → Low' },
  { value: 'popular',    label: 'Most popular' },
]
const PAGE_SIZE = 12
type MarketplaceStatusFilter = 'all' | 'available' | 'swapped'

const STATUS_FILTERS: { value: MarketplaceStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'swapped', label: 'Swapped' },
]

const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  ...PRODUCT_CATEGORIES.map(category => ({ value: category.name, label: category.name })),
]

type MarketplaceDropdownOption = {
  value: string
  label: string
}

type MarketplaceDropdownProps = {
  value: string
  options: readonly MarketplaceDropdownOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  contentClassName?: string
}

function MarketplaceDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  contentClassName,
}: MarketplaceDropdownProps) {
  const selectedLabel = options.find(option => option.value === value)?.label || 'Select'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            'inline-flex h-9 min-w-[10rem] max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors',
            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn(
          'max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-white p-1 text-foreground shadow-lg',
          contentClassName
        )}
      >
        {options.map(option => {
          const selected = option.value === value

          return (
            <DropdownMenuItem
              key={option.value || 'all'}
              onSelect={() => onChange(option.value)}
              className={cn(
                'cursor-pointer justify-between rounded-lg px-2.5 py-2 text-sm',
                selected && 'bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary'
              )}
            >
              <span className="truncate">{option.label}</span>
              <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const normalizeCategoryLabel = (category: unknown): string => {
  if (typeof category !== 'string') {
    return ''
  }

  return category
    .replace(/&amp;/gi, '&')
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

const mapProduct = (item: Record<string, unknown>): Product => ({
  id: String(item._id ?? item.id ?? ''),
  ownerId: String(
    typeof item.owner_id === 'object' && item.owner_id !== null
      ? (item.owner_id as Record<string, unknown>)._id ?? ''
      : item.owner_id ?? item.ownerId ?? ''
  ),
  title: typeof item.title === 'string' ? item.title : '',
  description: typeof item.description === 'string' ? item.description : '',
  category: normalizeCategoryLabel(item.category),
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
  isSaved: Boolean(item.is_saved ?? item.isSaved ?? false),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
})

const trustLevelFromScore = (trustScore: number): TrustLevel => {
  if (trustScore >= 70) return 'trusted'
  if (trustScore < 35) return 'risky'
  return 'new'
}

const mapOwner = (item: Record<string, unknown>): User => {
  const rawTrustScore = Number(item.trust_score ?? item.trustScore ?? 0)
  const trustScore = Number.isFinite(rawTrustScore) ? rawTrustScore : 0

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
    trustLevel: trustLevelFromScore(trustScore),
    trustScore,
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
  }
}

const parseNumberParam = (
  params: { get: (key: string) => string | null },
  key: string,
  fallback: number
) => {
  const raw = params.get(key)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : fallback
}

const parseSort = (value: string | null): ProductFilters['sortBy'] =>
  value === 'value-asc' || value === 'value-desc' || value === 'popular' ? value : 'newest'

const parseStatusFilter = (value: string | null): MarketplaceStatusFilter => {
  if (value === 'available' || value === 'active') return 'available'
  if (value === 'swapped') return 'swapped'
  return 'all'
}

const buildFiltersFromSearchParams = (params: { get: (key: string) => string | null }): ProductFilters => ({
  search: params.get('q') || '',
  category: params.get('category') || '',
  condition: params.get('condition') || '',
  minValue: parseNumberParam(params, 'minValue', parseNumberParam(params, 'min_value', 0)),
  maxValue: parseNumberParam(params, 'maxValue', parseNumberParam(params, 'max_value', 10000)),
  location: params.get('location') || '',
  sortBy: parseSort(params.get('sort')),
  isFeatured: params.get('featured') === 'true' ? true : undefined,
})

function MarketplaceContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const searchParamsKey = searchParams.toString()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(() => parseNumberParam(searchParams, 'page', 1))
  const [products, setProducts] = useState<Product[]>([])
  const [statusFilter, setStatusFilter] = useState<MarketplaceStatusFilter>(() => parseStatusFilter(searchParams.get('status')))
  const [owners, setOwners] = useState<User[]>([])
  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({})
  const [totalProducts, setTotalProducts] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ProductFilters>(() => buildFiltersFromSearchParams(searchParams))

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsKey)

    setFilters(buildFiltersFromSearchParams(nextParams))
    setStatusFilter(parseStatusFilter(nextParams.get('status')))
    setPage(parseNumberParam(nextParams, 'page', 1))
  }, [searchParamsKey])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const loadProducts = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('token') || ''
        const headers = token ? { 'Authorization': `Bearer ${token}` } : undefined
        const params = new URLSearchParams({
          status: statusFilter,
          page: String(page),
          limit: String(PAGE_SIZE),
          sort: filters.sortBy,
        })

        if (filters.search.trim()) params.set('q', filters.search.trim())
        if (filters.category) params.set('category', filters.category)
        if (filters.condition) params.set('condition', filters.condition)
        if (filters.location.trim()) params.set('location', filters.location.trim())
        if (filters.minValue > 0) params.set('min_value', String(filters.minValue))
        if (filters.maxValue < 10000) params.set('max_value', String(filters.maxValue))
        if (filters.isFeatured) params.set('featured', 'true')

        const response = await fetch(`${API_BASE_URL}/products?${params.toString()}`, {
          headers,
          signal: controller.signal,
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          throw new Error('Failed to load marketplace products.')
        }

        const items =
          typeof data === 'object' &&
          data !== null &&
          'products' in data &&
          Array.isArray(data.products)
            ? data.products
            : []

        if (!cancelled) {
          const nextProducts = items.map(item => mapProduct(item as Record<string, unknown>))
          const nextOwners = items
            .map(item => {
              const owner = (item as Record<string, unknown>).owner_id
              return typeof owner === 'object' && owner !== null
                ? mapOwner(owner as Record<string, unknown>)
                : null
            })
            .filter((owner): owner is User => owner !== null)

          const nextSavedStates = Object.fromEntries(
            items.map(item => {
              const product = item as Record<string, unknown>
              return [String(product._id ?? product.id ?? ''), Boolean(product.is_saved)]
            })
          )

          setProducts(nextProducts)
          setOwners(nextOwners)
          setSavedStates(nextSavedStates)
          setTotalProducts(
            typeof data === 'object' &&
            data !== null &&
            'total' in data &&
            typeof data.total === 'number'
              ? data.total
              : nextProducts.length
          )
          setTotalPages(
            Math.max(
              1,
              typeof data === 'object' &&
              data !== null &&
              'totalPages' in data &&
              typeof data.totalPages === 'number'
                ? data.totalPages
                : 1
            )
          )
        }
      } catch {
        if (controller.signal.aborted) {
          return
        }

        if (!cancelled) {
          setProducts([])
          setOwners([])
          setSavedStates({})
          setTotalProducts(0)
          setTotalPages(1)
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
      controller.abort()
    }
  }, [filters, page, statusFilter])

  const ownerMap = useMemo(() => Object.fromEntries(owners.map(u => [u.id, u])), [owners])

  const set = (key: keyof ProductFilters, value: string | number | boolean | undefined) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) }
  const setProductStatus = (value: MarketplaceStatusFilter) => {
    setStatusFilter(value)
    setPage(1)
  }
  const clear = (key: keyof ProductFilters) => {
    const d: Partial<ProductFilters> = { search: '', category: '', condition: '', minValue: 0, maxValue: 10000, location: '', sortBy: 'newest', isFeatured: undefined }
    setFilters(f => ({ ...f, [key]: d[key] })); setPage(1)
  }
  const clearAll = () => {
    setFilters({ search: '', category: '', condition: '', minValue: 0, maxValue: 10000, location: '', sortBy: 'newest', isFeatured: undefined })
    setStatusFilter('all')
    setPage(1)
  }

  const paginated = products
  const activeFilters = [
    filters.search && { key: 'search' as keyof ProductFilters, label: `"${filters.search}"` },
    filters.category && { key: 'category' as keyof ProductFilters, label: filters.category },
    filters.condition && { key: 'condition' as keyof ProductFilters, label: filters.condition },
    filters.location && { key: 'location' as keyof ProductFilters, label: filters.location },
    filters.minValue > 0 && { key: 'minValue' as keyof ProductFilters, label: `Min ${filters.minValue.toLocaleString()} EGP` },
    filters.maxValue < 10000 && { key: 'maxValue' as keyof ProductFilters, label: `Max ${filters.maxValue.toLocaleString()} EGP` },
    filters.isFeatured && { key: 'isFeatured' as keyof ProductFilters, label: 'Featured only' },
  ].filter(Boolean) as { key: keyof ProductFilters; label: string }[]

  const handleToggleSaved = async (productId: string) => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      router.push('/login')
      return
    }

    const response = await fetch(`${API_BASE_URL}/products/${productId}/save`, {
      method: 'POST',
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
      }
      return
    }

    const nextIsSaved =
      typeof data === 'object' &&
      data !== null &&
      'is_saved' in data &&
      typeof data.is_saved === 'boolean'
        ? data.is_saved
        : !savedStates[productId]

    const nextSavedCount =
      typeof data === 'object' &&
      data !== null &&
      'saved_count' in data &&
      typeof data.saved_count === 'number'
        ? data.saved_count
        : products.find(product => product.id === productId)?.savedCount || 0

    setSavedStates((current) => ({ ...current, [productId]: nextIsSaved }))
    setProducts((current) =>
      current.map((product) =>
        product.id === productId
          ? { ...product, savedCount: nextSavedCount }
          : product
      )
    )

    return { isSaved: nextIsSaved, savedCount: nextSavedCount }
  }

  return (
    <div className="page-container py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{totalProducts.toLocaleString()} products found</p>
        </div>
        <div className="flex items-center gap-2">
          <MarketplaceDropdown
            value={filters.sortBy}
            options={SORT_OPTIONS}
            onChange={value => set('sortBy', value)}
            ariaLabel="Sort marketplace products"
          />
          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilters.length > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{activeFilters.length}</span>}
          </Button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={filters.search} onChange={e => set('search', e.target.value)} placeholder="Search products, categories, tags…" className="pl-10 h-11" />
        {filters.search && <button onClick={() => clear('search')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground hover:text-foreground" /></button>}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {activeFilters.map(f => (
            <button key={f.key} onClick={() => clear(f.key)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              {f.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline">Clear all</button>
        </div>
      )}

      {filtersOpen && (
        <div className="mb-6 p-5 bg-card rounded-2xl border border-border animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Category</p>
              <div className="space-y-0.5 max-h-52 overflow-y-auto scrollbar-hide">
                <button onClick={() => set('category', '')} className={cn('w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors', !filters.category ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}>All categories</button>
                {PRODUCT_CATEGORIES.map(cat => <button key={cat.id} onClick={() => set('category', cat.name)} className={cn('w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors', filters.category === cat.name ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}>{cat.name}</button>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Condition</p>
              <div className="space-y-0.5">
                <button onClick={() => set('condition', '')} className={cn('w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors', !filters.condition ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}>Any condition</button>
                {CONDITIONS.map(c => <button key={c} onClick={() => set('condition', c)} className={cn('w-full text-left text-sm px-2 py-1.5 rounded-lg capitalize transition-colors', filters.condition === c ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted')}>{c.replace('-', ' ')}</button>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Value range (EGP)</p>
              <div className="space-y-3">
                <div><label className="text-xs text-muted-foreground">Min: {filters.minValue.toLocaleString()} EGP</label><input type="range" min={0} max={5000} step={50} value={filters.minValue} onChange={e => set('minValue', +e.target.value)} className="w-full mt-1 accent-primary" /></div>
                <div><label className="text-xs text-muted-foreground">Max: {filters.maxValue >= 10000 ? '10,000+ EGP' : `${filters.maxValue.toLocaleString()} EGP`}</label><input type="range" min={0} max={10000} step={100} value={filters.maxValue} onChange={e => set('maxValue', +e.target.value)} className="w-full mt-1 accent-primary" /></div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Location</p>
              <Input value={filters.location} onChange={e => set('location', e.target.value)} placeholder="Enter city…" className="mb-4" />
              <button onClick={() => set('isFeatured', filters.isFeatured ? undefined : true)} className={cn('flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-all w-full', filters.isFeatured ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-border hover:bg-muted')}>
                <Sparkles className="h-4 w-4" /> Featured only
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pb-2 mb-6">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {STATUS_FILTERS.map(status => (
            <button
              key={status.value}
              onClick={() => setProductStatus(status.value)}
              className={cn(
                'shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors',
                statusFilter === status.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {status.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <MarketplaceDropdown
            value={filters.category}
            options={CATEGORY_OPTIONS}
            onChange={value => set('category', value)}
            ariaLabel="Filter marketplace category"
            className="h-8 min-w-[10.75rem] rounded-full px-3 shadow-none"
          />
        </div>
      </div>

      {!loading && paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-lg">No products found</p>
          <p className="text-muted-foreground text-sm mt-1 mb-5">Try adjusting your filters or search terms</p>
          <Button variant="outline" onClick={clearAll}>Clear all filters</Button>
        </div>
      ) : !loading ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {paginated.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                owner={ownerMap[product.ownerId]}
                showOwner
                compact
                showActionButton
                isSaved={savedStates[product.id]}
                onToggleSaved={handleToggleSaved}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <Button variant="outline" size="icon" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                <Button key={p} variant={p === page ? 'default' : 'outline'} size="icon" onClick={() => setPage(p)} className="w-9 h-9">{p}</Button>
              ))}
              <Button variant="outline" size="icon" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={
      <div className="page-container py-8">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="bg-muted rounded-xl h-72 animate-pulse" />)}
        </div>
      </div>
    }>
      <MarketplaceContent />
    </Suspense>
  )
}
