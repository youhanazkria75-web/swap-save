'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Coins,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/form-elements'
import { Avatar, AvatarFallback, AvatarImage, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import { cn } from '@/lib/utils'
import { useSmartPolling } from '@/hooks/use-smart-polling'
import {
  ADMIN_TRANSACTION_DIRECTIONS,
  ADMIN_TRANSACTION_STATUSES,
  ADMIN_TRANSACTION_TYPES,
  adjustAdminCoins,
  fetchAdminTransactions,
  reconcileAdminPaymobTransaction,
  searchAdminTransactionUsers,
  type AdminAdjustmentDirection,
  type AdminTransaction,
  type AdminTransactionUser,
} from '@/lib/admin-transactions-api'

type FilterState = {
  type: string
  direction: string
  status: string
  user: string
  dateFrom: string
  dateTo: string
}

type AdjustmentState = {
  userSearch: string
  selectedUserId: string
  direction: AdminAdjustmentDirection
  amount: string
  reason: string
}

const PAGE_SIZE = 20

const emptyFilters: FilterState = {
  type: '',
  direction: '',
  status: '',
  user: '',
  dateFrom: '',
  dateTo: '',
}

const emptyAdjustment: AdjustmentState = {
  userSearch: '',
  selectedUserId: '',
  direction: 'credit',
  amount: '',
  reason: '',
}

const formatLabel = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())

const formatDate = (date: string) => {
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, 'MMM d, yyyy h:mm a')
}

const getInitials = (user: AdminTransactionUser | null) => {
  if (!user) return 'U'
  const first = user.firstName?.[0] || ''
  const last = user.lastName?.[0] || ''
  return `${first}${last}` || user.email?.[0]?.toUpperCase() || 'U'
}

const formatAmount = (tx: AdminTransaction) => {
  const sign = tx.direction === 'credit' || tx.direction === 'refund' || tx.direction === 'release' ? '+' : tx.direction === 'debit' || tx.direction === 'hold' ? '-' : ''
  return `${sign}${tx.amount} ${tx.currency}`
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<AdminTransaction[]>([])
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustment, setAdjustment] = useState<AdjustmentState>(emptyAdjustment)
  const [userOptions, setUserOptions] = useState<AdminTransactionUser[]>([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false)
  const [reconcilingId, setReconcilingId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const user = params.get('user')?.trim()

    if (!user) return

    setFilters(current => ({ ...current, user }))
    setAdjustment(current => ({ ...current, userSearch: user }))
    setAdjustOpen(true)
  }, [])

  const loadTransactions = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }

    try {
      const data = await fetchAdminTransactions({
        ...filters,
        page,
        limit: PAGE_SIZE,
      })
      setTransactions(data.transactions)
      setTotal(data.total)
      setTotalPages(Math.max(1, data.totalPages || 1))
    } catch (error) {
      if (showLoading) {
        toast.error(error instanceof Error ? error.message : 'Failed to load transactions.')
      }
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [filters, page])

  useEffect(() => {
    loadTransactions(true)
  }, [loadTransactions])

  useSmartPolling({
    intervalMs: 25000,
    poll: () => loadTransactions(false),
    runOnVisible: true,
  })

  useEffect(() => {
    if (!adjustOpen || !adjustment.userSearch.trim()) {
      setUserOptions([])
      setSearchingUsers(false)
      return
    }

    let cancelled = false
    const handle = window.setTimeout(async () => {
      setSearchingUsers(true)

      try {
        const users = await searchAdminTransactionUsers(adjustment.userSearch)
        if (!cancelled) {
          setUserOptions(users)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to search users.')
          setUserOptions([])
        }
      } finally {
        if (!cancelled) {
          setSearchingUsers(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [adjustOpen, adjustment.userSearch])

  const selectedUser = useMemo(
    () => userOptions.find(user => user.id === adjustment.selectedUserId) || null,
    [adjustment.selectedUserId, userOptions]
  )

  const completedOnPage = transactions.filter(tx => tx.status === 'completed').length
  const adminAdjustmentsOnPage = transactions.filter(tx => tx.type === 'admin_adjustment').length

  const setFilter = (key: keyof FilterState, value: string) => {
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilters(emptyFilters)
    setPage(1)
  }

  const openAdjustmentModal = () => {
    setAdjustment(emptyAdjustment)
    setUserOptions([])
    setAdjustOpen(true)
  }

  const closeAdjustmentModal = () => {
    setAdjustOpen(false)
    setAdjustment(emptyAdjustment)
    setUserOptions([])
  }

  const handleSelectUser = (user: AdminTransactionUser) => {
    setAdjustment(current => ({
      ...current,
      selectedUserId: user.id,
      userSearch: user.email || user.name,
    }))
    setUserOptions([user])
  }

  const handleAdjustmentSubmit = async () => {
    const amount = Number(adjustment.amount)
    const reason = adjustment.reason.trim()

    if (!adjustment.selectedUserId) {
      toast.error('Select a user before adjusting coins.')
      return
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error('Amount must be a positive whole number.')
      return
    }

    if (reason.length < 5) {
      toast.error('Reason must be at least 5 characters.')
      return
    }

    setSubmittingAdjustment(true)

    try {
      await adjustAdminCoins({
        userId: adjustment.selectedUserId,
        direction: adjustment.direction,
        amount,
        reason,
      })
      toast.success('Coin adjustment recorded')
      closeAdjustmentModal()
      await loadTransactions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to adjust coins.')
    } finally {
      setSubmittingAdjustment(false)
    }
  }

  const handleReconcilePayment = async (transaction: AdminTransaction) => {
    setReconcilingId(transaction.id)

    try {
      const result = await reconcileAdminPaymobTransaction(transaction.id)
      if (result.success === true || result.status === 'completed') {
        toast.success('Payment reconciled')
      } else {
        toast.info(result.reason || result.message || 'Payment is still pending.')
      }
      await loadTransactions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reconcile payment.')
    } finally {
      setReconcilingId(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{total} ledger transaction{total === 1 ? '' : 's'}</p>
        </div>
        <Button onClick={openAdjustmentModal}>
          <Coins className="h-4 w-4" />
          Adjust coins
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Matching ledger total', value: total, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Showing', value: transactions.length, color: 'bg-teal-50 text-teal-700 border-teal-200' },
          { label: 'Completed shown', value: completedOnPage, color: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Admin adjustments shown', value: adminAdjustmentsOnPage, color: 'bg-amber-50 text-amber-700 border-amber-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.color}`}>
            <p className="text-xl font-bold">{item.value}</p>
            <p className="text-xs font-medium opacity-80">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={filters.user}
              onChange={event => setFilter('user', event.target.value)}
              placeholder="Search user by name or email"
              className="pl-10"
            />
          </div>
          <AdminFilterDropdown
            value={filters.type}
            onChange={value => setFilter('type', value)}
            className="w-full"
            options={[
              { value: '', label: 'All types' },
              ...ADMIN_TRANSACTION_TYPES.map(type => ({ value: type, label: formatLabel(type) })),
            ]}
          />
          <AdminFilterDropdown
            value={filters.direction}
            onChange={value => setFilter('direction', value)}
            className="w-full"
            options={[
              { value: '', label: 'All directions' },
              ...ADMIN_TRANSACTION_DIRECTIONS.map(direction => ({ value: direction, label: formatLabel(direction) })),
            ]}
          />
          <AdminFilterDropdown
            value={filters.status}
            onChange={value => setFilter('status', value)}
            className="w-full"
            options={[
              { value: '', label: 'All statuses' },
              ...ADMIN_TRANSACTION_STATUSES.map(status => ({ value: status, label: formatLabel(status) })),
            ]}
          />
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset filters
          </Button>
          <Input type="date" value={filters.dateFrom} onChange={event => setFilter('dateFrom', event.target.value)} aria-label="Date from" />
          <Input type="date" value={filters.dateTo} onChange={event => setFilter('dateTo', event.target.value)} aria-label="Date to" />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Description</th>
                <th>Related</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id}>
                  <td>
                    <div className="flex items-center gap-2.5 min-w-44">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={tx.user?.avatar || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(tx.user)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tx.user?.name || 'Unknown user'}</p>
                        <p className="text-xs text-muted-foreground truncate">{tx.user?.email || 'No email'}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">{formatLabel(tx.type)}</Badge>
                  </td>
                  <td>
                    <Badge
                      variant={tx.direction === 'credit' || tx.direction === 'refund' || tx.direction === 'release' ? 'approved' : tx.direction === 'debit' || tx.direction === 'hold' ? 'rejected' : 'secondary'}
                      className="text-xs capitalize whitespace-nowrap"
                    >
                      {tx.direction}
                    </Badge>
                  </td>
                  <td className={cn(
                    'text-sm font-semibold whitespace-nowrap',
                    tx.direction === 'credit' || tx.direction === 'refund' || tx.direction === 'release'
                      ? 'text-green-700'
                      : tx.direction === 'debit' || tx.direction === 'hold'
                        ? 'text-red-700'
                        : ''
                  )}>
                    {formatAmount(tx)}
                  </td>
                  <td>
                    <Badge variant={tx.status === 'completed' ? 'approved' : tx.status === 'failed' ? 'rejected' : tx.status === 'refunded' ? 'info' : 'pending'} className="text-xs capitalize">
                      {tx.status}
                    </Badge>
                  </td>
                  <td className="text-sm max-w-64">
                    <p className="line-clamp-2">{tx.description || '-'}</p>
                  </td>
                  <td className="text-xs text-muted-foreground min-w-32">
                    {tx.swap || tx.product ? (
                      <div className="space-y-0.5">
                        {tx.swap && <p>Swap {tx.swap.id.slice(-6)}{tx.swap.status ? `: ${formatLabel(tx.swap.status)}` : ''}</p>}
                        {tx.product && <p>Product: {tx.product.title || tx.product.id.slice(-6)}</p>}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                  <td className="text-xs whitespace-nowrap">
                    {tx.type === 'service_fee' && tx.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReconcilePayment(tx)}
                        loading={reconcilingId === tx.id}
                        disabled={Boolean(reconcilingId)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reconcile payment
                      </Button>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transactions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">{loading ? 'Loading transactions...' : 'No transactions found'}</div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))}>
            Previous
          </Button>
          <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(current => current + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Dialog open={adjustOpen} onOpenChange={open => (open ? setAdjustOpen(true) : closeAdjustmentModal())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust coins</DialogTitle>
            <DialogDescription>Manual wallet changes require a user, amount, and clear reason. The ledger records every adjustment.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">User *</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={adjustment.userSearch}
                  onChange={event => setAdjustment(current => ({ ...current, userSearch: event.target.value, selectedUserId: '' }))}
                  placeholder="Search by name or email"
                  className="pl-10"
                />
              </div>
              {adjustment.userSearch.trim() && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                  {searchingUsers ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Searching users...</div>
                  ) : userOptions.length > 0 ? (
                    userOptions.map(user => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted',
                          adjustment.selectedUserId === user.id && 'bg-primary/10 text-primary'
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{user.name || user.email}</span>
                          <span className="block text-xs text-muted-foreground truncate">{user.email}</span>
                        </span>
                        {user.coins !== undefined && <span className="shrink-0 text-xs font-medium">{user.coins} coins</span>}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-sm text-muted-foreground">No users found</div>
                  )}
                </div>
              )}
              {selectedUser && (
                <p className="text-xs text-muted-foreground">Selected balance: {selectedUser.coins ?? 0} coins</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Direction *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustment(current => ({ ...current, direction: 'credit' }))}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    adjustment.direction === 'credit' ? 'border-green-300 bg-green-50 text-green-700' : 'border-border hover:bg-muted'
                  )}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Add coins
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustment(current => ({ ...current, direction: 'debit' }))}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    adjustment.direction === 'debit' ? 'border-red-300 bg-red-50 text-red-700' : 'border-border hover:bg-muted'
                  )}
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  Remove coins
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Amount *</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={adjustment.amount}
                onChange={event => setAdjustment(current => ({ ...current, amount: event.target.value }))}
                placeholder="20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason *</label>
              <Textarea
                value={adjustment.reason}
                onChange={event => setAdjustment(current => ({ ...current, reason: event.target.value }))}
                placeholder="Compensation for delivery delay"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={closeAdjustmentModal} disabled={submittingAdjustment}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleAdjustmentSubmit} loading={submittingAdjustment}>
                Record adjustment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
