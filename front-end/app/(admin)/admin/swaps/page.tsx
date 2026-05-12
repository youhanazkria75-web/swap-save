'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Eye, Flag, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/form-elements'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SwapStatusBadge } from '@/components/shared/status-badges'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import { fetchAdminSwaps } from '@/lib/admin-swaps-api'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { ExchangeMethod, Product, SwapRequest, SwapStatus, User } from '@/types'

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

const PAGE_SIZE = 50

const formatValue = (value?: string) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '-'

const getDeliveryLabel = (swap: SwapRequest) =>
  swap.exchangeMethod === 'delivery'
    ? formatValue(swap.deliveryDetails?.deliveryStatus || 'pending_pickup')
    : '-'

const getServiceFeeSummary = (swap: SwapRequest): { label: string; variant: 'approved' | 'warning' | 'outline' } => {
  const paidCount = Number(swap.requesterPaid) + Number(swap.receiverPaid)

  if (paidCount === 2) return { label: 'Both paid', variant: 'approved' }
  if (paidCount === 1) return { label: '1/2 paid', variant: 'warning' }
  return { label: 'Not paid', variant: 'outline' }
}

export default function AdminSwapsPage() {
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SwapStatus | 'all'>('all')
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeMethod | 'all'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadSwaps = useCallback(async () => {
    setLoading(true)

    try {
      const data = await fetchAdminSwaps({
        status: statusFilter,
        exchangeMethod: exchangeFilter,
        q: search,
        page,
        limit: PAGE_SIZE,
      })
      setSwaps(data.swaps)
      setUsers(data.users)
      setProducts(data.products)
      setTotal(data.total)
      setTotalPages(Math.max(data.totalPages || 1, 1))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load swaps.')
      setSwaps([])
      setUsers({})
      setProducts({})
      setTotal(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [exchangeFilter, page, search, statusFilter])

  useEffect(() => {
    loadSwaps()
  }, [loadSwaps])

  const updateStatusFilter = (value: SwapStatus | 'all') => {
    setStatusFilter(value)
    setPage(1)
  }

  const updateExchangeFilter = (value: ExchangeMethod | 'all') => {
    setExchangeFilter(value)
    setPage(1)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Swaps</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{total.toLocaleString()} matching swap requests</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Showing', count: swaps.length, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Under review shown', count: swaps.filter(s => s.status === 'under_review').length, color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'In progress shown', count: swaps.filter(s => s.status === 'in_progress').length, color: 'bg-teal-50 text-teal-700 border-teal-200' },
          { label: 'Completed shown', count: swaps.filter(s => s.status === 'completed').length, color: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Disputed shown', count: swaps.filter(s => s.status === 'disputed').length, color: 'bg-red-50 text-red-700 border-red-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.color}`}>
            <p className="text-xl font-bold">{item.count.toLocaleString()}</p>
            <p className="text-xs font-medium opacity-80">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1) }}
              placeholder="Search by swap id, user, email, or product..."
              className="pl-10"
            />
          </div>
          <AdminFilterDropdown
            value={exchangeFilter}
            onChange={value => updateExchangeFilter(value as ExchangeMethod | 'all')}
            options={[
              { value: 'all', label: 'All exchange methods' },
              { value: 'meetup', label: 'Meetup' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {STATUS_FILTERS.map(filter => (
            <button
              key={filter.value}
              onClick={() => updateStatusFilter(filter.value)}
              className={cn('shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                statusFilter === filter.value ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1180px] table-fixed">
            <thead>
              <tr>
                <th className="w-[230px]">Swap</th>
                <th className="w-[145px]">Requester</th>
                <th className="hidden sm:table-cell w-[145px]">Receiver</th>
                <th className="w-[130px] text-center">Status</th>
                <th className="hidden md:table-cell w-[115px] text-center">Service Fee</th>
                <th className="hidden md:table-cell w-[105px] text-center">Exchange</th>
                <th className="hidden lg:table-cell w-[125px] text-center">Compensation</th>
                <th className="hidden lg:table-cell w-[125px] text-center">Delivery</th>
                <th className="hidden md:table-cell w-[105px] text-center">Created</th>
                <th className="w-[75px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && swaps.map(swap => {
                const requester = users[swap.requesterId]
                const receiver = users[swap.receiverId]
                const offered = products[swap.offeredProductId]
                const requested = products[swap.requestedProductId]
                const serviceFeeSummary = getServiceFeeSummary(swap)
                return (
                  <tr key={swap.id}>
                    <td className="align-middle">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-md overflow-hidden bg-muted shrink-0">
                          {offered?.images[0] && <img src={offered.images[0]} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate max-w-36">{offered?.title || 'Unavailable product'}</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-36">to {requested?.title || 'Unavailable product'}</p>
                          <p className="text-[10px] text-muted-foreground truncate max-w-36">ID: {swap.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="align-middle text-sm">
                      <span className="block max-w-[8rem] truncate">{requester ? `${requester.firstName} ${requester.lastName}` : 'Deleted user'}</span>
                    </td>
                    <td className="hidden sm:table-cell align-middle text-sm">
                      <span className="block max-w-[8rem] truncate">{receiver ? `${receiver.firstName} ${receiver.lastName}` : 'Deleted user'}</span>
                    </td>
                    <td className="align-middle text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SwapStatusBadge
                          status={swap.status}
                          className="min-w-[7.25rem] justify-center whitespace-nowrap px-3 py-1 text-center"
                        />
                        {(swap.openReportCount || 0) > 0 && (
                          <Link href="/admin/reports" className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
                            <Flag className="h-3 w-3" />{swap.openReportCount} open
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="hidden md:table-cell align-middle text-center">
                      <Badge
                        variant={serviceFeeSummary.variant}
                        className="min-w-[5.75rem] justify-center whitespace-nowrap px-3 py-1 text-center"
                      >
                        {serviceFeeSummary.label}
                      </Badge>
                    </td>
                    <td className="hidden md:table-cell align-middle text-center text-sm text-muted-foreground whitespace-nowrap">{formatValue(swap.exchangeMethod)}</td>
                    <td className="hidden lg:table-cell align-middle text-center text-sm">
                      {swap.compensationStatus && swap.compensationStatus !== 'none'
                        ? <Badge variant={swap.compensationStatus === 'held' ? 'warning' : 'outline'} className="justify-center whitespace-nowrap px-3 py-1 text-center">{formatValue(swap.compensationStatus)}</Badge>
                        : <span className="text-muted-foreground">None</span>}
                    </td>
                    <td className="hidden lg:table-cell align-middle text-center text-sm text-muted-foreground whitespace-nowrap">{getDeliveryLabel(swap)}</td>
                    <td className="hidden md:table-cell align-middle text-center text-xs text-muted-foreground whitespace-nowrap">{format(new Date(swap.createdAt), 'MMM d, yyyy')}</td>
                    <td className="align-middle text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/swaps/${swap.id}`} className="gap-2 cursor-pointer">
                              <Eye className="h-4 w-4" />View details
                            </Link>
                          </DropdownMenuItem>
                          {swap.status === 'under_review' && (
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/swaps/${swap.id}`} className="gap-2 cursor-pointer">
                                <Eye className="h-4 w-4" />Review approval
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {(swap.openReportCount || 0) > 0 && (
                            <DropdownMenuItem asChild>
                              <Link href="/admin/reports" className="gap-2 cursor-pointer">
                                <Flag className="h-4 w-4" />Resolve reports
                              </Link>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-12 text-muted-foreground text-sm">Loading swaps...</div>}
        {!loading && swaps.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No swaps found</div>}
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
