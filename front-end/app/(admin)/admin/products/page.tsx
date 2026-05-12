'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Search, Eye, Sparkles, MoreVertical, Flag,
  Ban, RotateCcw, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/form-elements'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProductStatusBadge, ConditionBadge } from '@/components/shared/status-badges'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import {
  fetchAdminProducts,
  updateAdminProduct,
  type AdminProduct,
  type AdminProductsSummary,
} from '@/lib/admin-products-api'
import { getBooleanSearchParam, getEnumSearchParam, getSearchParam } from '@/lib/admin-query-params'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

const emptySummary: AdminProductsSummary = {
  total: 0,
  featured: 0,
  reported: 0,
  inactive: 0,
  rejected: 0,
}

const PRODUCT_STATUS_FILTERS = ['all', 'available', 'reserved', 'swapped', 'inactive', 'rejected'] as const
const FEATURED_FILTERS = ['all', 'true', 'false'] as const

function AdminProductsContent() {
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [summary, setSummary] = useState<AdminProductsSummary>(emptySummary)
  const [search, setSearch] = useState(() => getSearchParam(searchParams, 'q'))
  const [categoryFilter, setCategoryFilter] = useState(() => getSearchParam(searchParams, 'category') || 'all')
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'status', PRODUCT_STATUS_FILTERS, 'all')
  )
  const [featuredFilter, setFeaturedFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'featured', FEATURED_FILTERS, 'all')
  )
  const [reportedOnly, setReportedOnly] = useState(() => getBooleanSearchParam(searchParams, 'reported'))
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processingProductId, setProcessingProductId] = useState<string | null>(null)

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsKey)

    setSearch(getSearchParam(nextParams, 'q'))
    setCategoryFilter(getSearchParam(nextParams, 'category') || 'all')
    setStatusFilter(getEnumSearchParam(nextParams, 'status', PRODUCT_STATUS_FILTERS, 'all'))
    setFeaturedFilter(getEnumSearchParam(nextParams, 'featured', FEATURED_FILTERS, 'all'))
    setReportedOnly(getBooleanSearchParam(nextParams, 'reported'))
    setPage(1)
  }, [searchParamsKey])

  const loadProducts = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetchAdminProducts({
        q: search.trim(),
        category: categoryFilter,
        status: statusFilter,
        featured: featuredFilter,
        reported: reportedOnly ? 'true' : '',
        page,
        limit: 25,
      })
      setProducts(response.products)
      setCategories(response.categories)
      setSummary(response.summary)
      setTotal(response.total)
      setTotalPages(Math.max(response.totalPages || 1, 1))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load products')
      setProducts([])
      setCategories([])
      setSummary(emptySummary)
      setTotal(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, featuredFilter, page, reportedOnly, search, statusFilter])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value)
    setPage(1)
  }

  const patchProduct = async (product: AdminProduct, updates: Parameters<typeof updateAdminProduct>[1], successMessage: string) => {
    setProcessingProductId(product.id)

    try {
      const updated = await updateAdminProduct(product.id, updates)
      setProducts(current => current.map(item => item.id === updated.id ? updated : item))
      toast.success(successMessage)
      loadProducts()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update product')
    } finally {
      setProcessingProductId(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{total.toLocaleString()} matching listings</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', count: summary.total, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Featured', count: summary.featured, color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Reported', count: summary.reported, color: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Inactive', count: summary.inactive, color: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Rejected', count: summary.rejected, color: 'bg-rose-50 text-rose-700 border-rose-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.color}`}>
            <p className="text-xl font-bold">{s.count.toLocaleString()}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search products, owners, categories..."
              className="pl-10"
            />
          </div>
          <AdminFilterDropdown
            value={categoryFilter}
            onChange={value => updateFilter(setCategoryFilter, value)}
            options={[
              { value: 'all', label: 'All categories' },
              ...categories.map(category => ({ value: category, label: category })),
            ]}
          />
          <AdminFilterDropdown
            value={statusFilter}
            onChange={value => updateFilter(setStatusFilter, value)}
            options={[
              { value: 'all', label: 'All statuses' },
              ...['available', 'reserved', 'swapped', 'inactive', 'rejected'].map(status => ({
                value: status,
                label: status.replace('_', ' '),
              })),
            ]}
          />
          <AdminFilterDropdown
            value={featuredFilter}
            onChange={value => updateFilter(setFeaturedFilter, value)}
            options={[
              { value: 'all', label: 'All feature states' },
              { value: 'true', label: 'Featured' },
              { value: 'false', label: 'Not featured' },
            ]}
          />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Owner</th>
                <th className="hidden md:table-cell">Category</th>
                <th className="hidden sm:table-cell">Value</th>
                <th>Status</th>
                <th className="hidden lg:table-cell">Views</th>
                <th className="hidden lg:table-cell">Saves</th>
                <th className="hidden md:table-cell">Reports</th>
                <th className="hidden md:table-cell">Listed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && products.map(product => (
                <tr key={product.id} className={cn(processingProductId === product.id && 'opacity-60')}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted shrink-0">
                        {product.images[0] && <img src={product.images[0]} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate max-w-40">{product.title}</p>
                        <ConditionBadge condition={product.condition} />
                      </div>
                    </div>
                  </td>
                  <td className="text-sm">
                    <div className="flex flex-col">
                      <span>{product.owner?.name || 'Deleted user'}</span>
                      {product.owner?.isDeleted && <span className="text-xs text-muted-foreground">Deleted account</span>}
                    </div>
                  </td>
                  <td className="hidden md:table-cell text-sm text-muted-foreground">{product.category}</td>
                  <td className="hidden sm:table-cell text-sm font-medium">~{product.estimatedValue.toLocaleString()} EGP</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <ProductStatusBadge status={product.status} />
                      {product.isFeatured && <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                  </td>
                  <td className="hidden lg:table-cell text-sm text-muted-foreground">{product.viewCount.toLocaleString()}</td>
                  <td className="hidden lg:table-cell text-sm text-muted-foreground">{product.savedCount.toLocaleString()}</td>
                  <td className="hidden md:table-cell text-sm">
                    {product.reportCount > 0 ? (
                      <Link href="/admin/reports" className="inline-flex items-center gap-1 text-destructive hover:underline">
                        <Flag className="h-3.5 w-3.5" />{product.reportCount}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell text-xs text-muted-foreground">{format(new Date(product.createdAt), 'MMM d, yyyy')}</td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" disabled={processingProductId === product.id}><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild className="gap-2">
                          <Link href={`/products/${product.id}`}><Eye className="h-4 w-4" />View listing</Link>
                        </DropdownMenuItem>
                        {product.reportCount > 0 && (
                          <DropdownMenuItem asChild className="gap-2">
                            <Link href="/admin/reports"><Flag className="h-4 w-4" />Review reports</Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {product.isFeatured ? (
                          <DropdownMenuItem className="gap-2" onClick={() => patchProduct(product, { is_featured: false }, 'Product unfeatured')}>
                            <Sparkles className="h-4 w-4" />Unfeature
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="gap-2"
                            disabled={product.status !== 'available'}
                            onClick={() => patchProduct(product, { is_featured: true }, 'Product featured')}
                          >
                            <Sparkles className="h-4 w-4" />Feature
                          </DropdownMenuItem>
                        )}
                        {['inactive', 'rejected'].includes(product.status) ? (
                          <DropdownMenuItem className="gap-2" onClick={() => patchProduct(product, { status: 'available' }, 'Product restored')}>
                            <RotateCcw className="h-4 w-4" />Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="gap-2"
                            disabled={['reserved', 'swapped'].includes(product.status)}
                            onClick={() => patchProduct(product, { status: 'inactive' }, 'Product hidden')}
                          >
                            <Ban className="h-4 w-4" />Hide
                          </DropdownMenuItem>
                        )}
                        {!['reserved', 'swapped', 'rejected'].includes(product.status) && (
                          <DropdownMenuItem className="gap-2 text-destructive" onClick={() => patchProduct(product, { status: 'rejected' }, 'Product rejected')}>
                            <XCircle className="h-4 w-4" />Reject
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-12 text-muted-foreground text-sm">Loading products...</div>}
        {!loading && products.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No products match your filters</div>}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(value - 1, 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </div>
    </div>
  )
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={null}>
      <AdminProductsContent />
    </Suspense>
  )
}
