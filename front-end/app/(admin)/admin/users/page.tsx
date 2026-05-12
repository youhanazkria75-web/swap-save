'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Search, Eye, MoreVertical, CheckCircle2, XCircle, Star,
  Flag, UserX, Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/form-elements'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/primitives'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TrustBadge } from '@/components/shared/status-badges'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import { fetchAdminUsers, removeAdminUserFromPlatform, type AdminUser, type AdminUsersSummary } from '@/lib/admin-users-api'
import { getBooleanSearchParam, getEnumSearchParam, getSearchParam } from '@/lib/admin-query-params'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { TrustLevel } from '@/types'

const emptySummary: AdminUsersSummary = {
  total: 0,
  active: 0,
  deleted: 0,
  unverified: 0,
  reported: 0,
  lowTrust: 0,
}

const VERIFICATION_FILTERS = ['all', 'verified', 'unverified', 'email_verified', 'email_unverified', 'phone_verified', 'phone_unverified'] as const
const USER_STATUS_FILTERS = ['active', 'pending_verification', 'deleted', 'all'] as const
const TRUST_FILTERS = ['all', 'trusted', 'new', 'risky', 'low'] as const

const initialsFor = (user: AdminUser) => {
  const first = user.firstName?.[0] || user.name?.[0] || 'U'
  const last = user.lastName?.[0] || ''
  return `${first}${last}`.toUpperCase()
}

function AdminUsersContent() {
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [summary, setSummary] = useState<AdminUsersSummary>(emptySummary)
  const [search, setSearch] = useState(() => getSearchParam(searchParams, 'q'))
  const [verificationFilter, setVerificationFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'verification', VERIFICATION_FILTERS, 'all')
  )
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'status', USER_STATUS_FILTERS, 'active')
  )
  const [trustFilter, setTrustFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'trust', TRUST_FILTERS, 'all')
  )
  const [reportedOnly, setReportedOnly] = useState(() => getBooleanSearchParam(searchParams, 'reported'))
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [removalTarget, setRemovalTarget] = useState<AdminUser | null>(null)
  const [removalReason, setRemovalReason] = useState('')

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsKey)

    setSearch(getSearchParam(nextParams, 'q'))
    setVerificationFilter(getEnumSearchParam(nextParams, 'verification', VERIFICATION_FILTERS, 'all'))
    setStatusFilter(getEnumSearchParam(nextParams, 'status', USER_STATUS_FILTERS, 'active'))
    setTrustFilter(getEnumSearchParam(nextParams, 'trust', TRUST_FILTERS, 'all'))
    setReportedOnly(getBooleanSearchParam(nextParams, 'reported'))
    setPage(1)
  }, [searchParamsKey])

  const loadUsers = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetchAdminUsers({
        q: search.trim(),
        verification: verificationFilter,
        status: statusFilter,
        trust: trustFilter,
        reported: reportedOnly ? 'true' : '',
        page,
        limit: 25,
      })
      setUsers(response.users)
      setSummary(response.summary)
      setTotal(response.total)
      setTotalPages(Math.max(response.totalPages || 1, 1))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load users')
      setUsers([])
      setSummary(emptySummary)
      setTotal(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [page, reportedOnly, search, statusFilter, trustFilter, verificationFilter])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value)
    setPage(1)
  }

  const handleRemoveFromPlatform = async () => {
    if (!removalTarget) return

    const reason = removalReason.trim()

    if (reason.length < 5) {
      toast.error('Reason must be at least 5 characters.')
      return
    }

    setProcessing(true)

    try {
      const updated = await removeAdminUserFromPlatform(removalTarget.id, reason)
      setUsers(current => current.map(user => user.id === updated.id ? updated : user))
      setRemovalTarget(null)
      setRemovalReason('')
      toast.success('User removed from platform')
      loadUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove user from platform')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{total.toLocaleString()} matching users</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total', count: summary.total, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Active', count: summary.active, color: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Unverified', count: summary.unverified, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
          { label: 'Deleted', count: summary.deleted, color: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Reported', count: summary.reported, color: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Low Trust', count: summary.lowTrust, color: 'bg-amber-50 text-amber-700 border-amber-200' },
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
              placeholder="Search by name, email, city..."
              className="pl-10"
            />
          </div>
          <AdminFilterDropdown
            value={verificationFilter}
            onChange={value => updateFilter(setVerificationFilter, value)}
            options={[
              { value: 'all', label: 'All verification' },
              { value: 'verified', label: 'Email and phone verified' },
              { value: 'unverified', label: 'Missing verification' },
              { value: 'email_verified', label: 'Email verified' },
              { value: 'email_unverified', label: 'Email unverified' },
              { value: 'phone_verified', label: 'Phone verified' },
              { value: 'phone_unverified', label: 'Phone unverified' },
            ]}
          />
          <AdminFilterDropdown
            value={statusFilter}
            onChange={value => updateFilter(setStatusFilter, value)}
            options={[
              { value: 'active', label: 'Active users' },
              { value: 'pending_verification', label: 'Pending verification' },
              { value: 'deleted', label: 'Deleted users' },
              { value: 'all', label: 'All statuses' },
            ]}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', 'trusted', 'new', 'risky', 'low'].map(f => (
            <button key={f} onClick={() => updateFilter(setTrustFilter, f)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors',
                trustFilter === f ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
              )}>
              {f === 'low' ? 'Low trust' : f}
            </button>
          ))}
          <button
            onClick={() => { setReportedOnly(value => !value); setPage(1) }}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              reportedOnly ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted'
            )}
          >
            Reported
          </button>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Trust</th>
                <th className="hidden sm:table-cell">Swaps</th>
                <th className="hidden lg:table-cell">Rating</th>
                <th className="hidden md:table-cell">Coins</th>
                <th className="hidden lg:table-cell">Verified</th>
                <th className="hidden md:table-cell">Joined</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && users.map(user => (
                <tr key={user.id} className={cn(user.isDeleted && 'opacity-70')}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback className="text-xs bg-brand-100 text-brand-700">{initialsFor(user)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{user.name || 'Deleted User'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><Badge variant={user.role === 'admin' ? 'info' : 'outline'}>{user.role}</Badge></td>
                  <td>
                    {user.isDeleted ? (
                      <Badge variant="cancelled">Deleted</Badge>
                    ) : user.role === 'admin' ? (
                      <Badge variant="info">Admin</Badge>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <TrustBadge level={user.trustLevel as TrustLevel} />
                        <span className="text-xs text-muted-foreground">{user.trustScore}/100</span>
                      </div>
                    )}
                  </td>
                  <td className="hidden sm:table-cell text-sm">{user.completedSwaps}/{user.totalSwaps}</td>
                  <td className="hidden lg:table-cell text-sm">
                    {user.rating > 0 ? (
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        {user.rating.toFixed(1)} <span className="text-xs text-muted-foreground">({user.ratingCount})</span>
                      </span>
                    ) : <span className="text-muted-foreground text-xs">No ratings</span>}
                  </td>
                  <td className="hidden md:table-cell text-sm">
                    <div className="flex flex-col">
                      <span>{user.coins.toLocaleString()} coins</span>
                      {user.heldCoins > 0 && <span className="text-xs text-muted-foreground">{user.heldCoins.toLocaleString()} held</span>}
                    </div>
                  </td>
                  <td className="hidden lg:table-cell">
                    <div className="flex gap-1">
                      {user.isEmailVerified
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <XCircle className="h-4 w-4 text-muted-foreground/40" />
                      }
                      {user.isPhoneVerified
                        ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                        : <XCircle className="h-4 w-4 text-muted-foreground/40" />
                      }
                    </div>
                  </td>
                  <td className="hidden md:table-cell text-xs text-muted-foreground">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
                  <td>
                    {user.isDeleted ? (
                      <Badge variant="cancelled">Deleted</Badge>
                    ) : user.accountStatus === 'pending_verification' || !user.isEmailVerified ? (
                      <Badge variant="pending">Pending verification</Badge>
                    ) : (
                      <Badge variant="approved">Active</Badge>
                    )}
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!user.isDeleted && (
                          <DropdownMenuItem asChild className="gap-2">
                            <Link href={`/users/${user.id}`}><Eye className="h-4 w-4" />View profile</Link>
                          </DropdownMenuItem>
                        )}
                        {!user.isDeleted && user.role !== 'admin' && (
                          <DropdownMenuItem asChild className="gap-2">
                            <Link href={`/admin/transactions?user=${encodeURIComponent(user.email || user.id)}`}>
                              <Wallet className="h-4 w-4" />Adjust coins
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {user.reportCount > 0 && (
                          <DropdownMenuItem asChild className="gap-2">
                            <Link href="/admin/reports"><Flag className="h-4 w-4" />Review reports</Link>
                          </DropdownMenuItem>
                        )}
                        {!user.isDeleted && user.role !== 'admin' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2 text-destructive" onClick={() => setRemovalTarget(user)}>
                              <UserX className="h-4 w-4" />Remove from platform
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="text-center py-12 text-muted-foreground text-sm">Loading users...</div>}
        {!loading && users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No users match your filters</div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(value - 1, 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </div>

      <Dialog
        open={!!removalTarget}
        onOpenChange={open => {
          if (open) return
          setRemovalTarget(null)
          setRemovalReason('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from platform</DialogTitle>
            <DialogDescription>
              This blocks the account identity, removes personal profile data, and hides non-swapped listings. Users with active swaps cannot be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Remove <span className="font-medium">{removalTarget?.name}</span> from the platform?
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason *</label>
              <Textarea
                value={removalReason}
                onChange={event => setRemovalReason(event.target.value)}
                placeholder="Policy violation or platform safety reason"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Minimum 5 characters.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setRemovalTarget(null)
                  setRemovalReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleRemoveFromPlatform}
                loading={processing}
                disabled={removalReason.trim().length < 5}
              >
                <UserX className="h-4 w-4" /> Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersContent />
    </Suspense>
  )
}
