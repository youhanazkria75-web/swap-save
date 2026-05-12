'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle, ArrowLeftRight, CheckCircle2, Coins, Eye, Flag,
  Package, Search, User, UserX,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/form-elements'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import { cn } from '@/lib/utils'
import {
  fetchAdminSuspiciousActivity,
  type SuspiciousActivityItem,
  type SuspiciousActivitySummary,
  type SuspiciousActivityUser,
} from '@/lib/admin-suspicious-activity-api'
import { removeAdminUserFromPlatform } from '@/lib/admin-users-api'
import { getEnumSearchParam, getSearchParam } from '@/lib/admin-query-params'

const emptySummary: SuspiciousActivitySummary = {
  total: 0,
  high: 0,
  medium: 0,
  low: 0,
  userReports: 0,
  productReports: 0,
  excessiveDisputes: 0,
  coinAdjustments: 0,
  reportSpam: 0,
}

const SOURCE_LABELS: Record<string, string> = {
  user_reports: 'User reports',
  product_reports: 'Product reports',
  excessive_disputes: 'Disputes',
  coin_adjustments: 'Coin adjustments',
  report_spam: 'Report spam',
}

const SOURCE_ICONS = {
  user_reports: User,
  product_reports: Package,
  excessive_disputes: ArrowLeftRight,
  coin_adjustments: Coins,
  report_spam: Flag,
}

const SEVERITY_BADGES: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-blue-50 text-blue-700 border-blue-200',
}

const SOURCE_FILTERS = ['all', 'user_reports', 'product_reports', 'excessive_disputes', 'coin_adjustments', 'report_spam'] as const
const SEVERITY_FILTERS = ['all', 'high', 'medium', 'low'] as const

const removalCandidateFor = (activity: SuspiciousActivityItem) =>
  activity.targetUser || activity.targetProduct?.owner || null

function SuspiciousActivityContent() {
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [activities, setActivities] = useState<SuspiciousActivityItem[]>([])
  const [summary, setSummary] = useState<SuspiciousActivitySummary>(emptySummary)
  const [sourceFilter, setSourceFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'source', SOURCE_FILTERS, 'all')
  )
  const [severityFilter, setSeverityFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'severity', SEVERITY_FILTERS, 'all')
  )
  const [search, setSearch] = useState(() => getSearchParam(searchParams, 'q'))
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [removalTarget, setRemovalTarget] = useState<SuspiciousActivityUser | null>(null)
  const [removalReason, setRemovalReason] = useState('')

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsKey)

    setSourceFilter(getEnumSearchParam(nextParams, 'source', SOURCE_FILTERS, 'all'))
    setSeverityFilter(getEnumSearchParam(nextParams, 'severity', SEVERITY_FILTERS, 'all'))
    setSearch(getSearchParam(nextParams, 'q'))
  }, [searchParamsKey])

  const loadActivities = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetchAdminSuspiciousActivity({
        source: sourceFilter,
        severity: severityFilter,
        q: search,
      })
      setActivities(response.activities)
      setSummary(response.summary)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load suspicious activity')
      setActivities([])
      setSummary(emptySummary)
    } finally {
      setLoading(false)
    }
  }, [search, severityFilter, sourceFilter])

  useEffect(() => {
    loadActivities()
  }, [loadActivities])

  const handleRemoveFromPlatform = async () => {
    if (!removalTarget) return

    const reason = removalReason.trim()

    if (reason.length < 5) {
      toast.error('Reason must be at least 5 characters.')
      return
    }

    setProcessing(true)

    try {
      await removeAdminUserFromPlatform(removalTarget.id, reason)
      setRemovalTarget(null)
      setRemovalReason('')
      toast.success('User removed from platform')
      loadActivities()
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
          <h1 className="text-2xl font-bold">Suspicious Activity</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {summary.total.toLocaleString()} real signal{summary.total === 1 ? '' : 's'} detected
          </p>
        </div>
        {summary.high > 0 && (
          <Badge className="bg-red-50 text-red-700 border-red-200 gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {summary.high} high severity
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', count: summary.total, color: 'bg-muted/60 text-foreground border-border' },
          { label: 'High', count: summary.high, color: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Medium', count: summary.medium, color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Low', count: summary.low, color: 'bg-blue-50 text-blue-700 border-blue-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.color}`}>
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
              onChange={event => setSearch(event.target.value)}
              placeholder="Search users, products, or reasons..."
              className="pl-10"
            />
          </div>
          <AdminFilterDropdown
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: 'all', label: 'All sources' },
              { value: 'user_reports', label: 'Repeated user reports' },
              { value: 'product_reports', label: 'Repeated product reports' },
              { value: 'excessive_disputes', label: 'Excessive disputes' },
              { value: 'coin_adjustments', label: 'Coin adjustments' },
              { value: 'report_spam', label: 'Report spam' },
            ]}
          />
          <AdminFilterDropdown
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { value: 'all', label: 'All severities' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading suspicious activity...</div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-lg border border-border">
          <CheckCircle2 className="h-12 w-12 text-green-500/40 mb-4" />
          <p className="font-semibold">No suspicious activity detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map(activity => {
            const SourceIcon = SOURCE_ICONS[activity.source] || AlertTriangle
            const severityClass = SEVERITY_BADGES[activity.severity] || SEVERITY_BADGES.low
            const removalCandidate = removalCandidateFor(activity)

            return (
              <div key={activity.id} className="bg-card rounded-lg border border-border p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', severityClass)}>
                      <SourceIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold">{activity.title}</h2>
                        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold capitalize', severityClass)}>
                          {activity.severity}
                        </span>
                        <Badge variant="outline">{SOURCE_LABELS[activity.source] || activity.sourceLabel}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{activity.count.toLocaleString()} event{activity.count === 1 ? '' : 's'}</span>
                        {activity.openCount > 0 && <span>{activity.openCount.toLocaleString()} open or in review</span>}
                        <span>{format(new Date(activity.latestAt), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                      {activity.reports.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {activity.reports.slice(0, 3).map(report => (
                            <Badge key={report.id} variant="secondary" className="max-w-full truncate">
                              {report.reason || report.status}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap lg:justify-end gap-2 shrink-0">
                    {activity.actions.reportsUrl && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={activity.actions.reportsUrl}>
                          <Flag className="h-3.5 w-3.5" />
                          Reports
                        </Link>
                      </Button>
                    )}
                    {activity.actions.userUrl && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={activity.actions.userUrl}>
                          <Eye className="h-3.5 w-3.5" />
                          User
                        </Link>
                      </Button>
                    )}
                    {activity.actions.productUrl && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={activity.actions.productUrl}>
                          <Package className="h-3.5 w-3.5" />
                          Product
                        </Link>
                      </Button>
                    )}
                    {removalCandidate && removalCandidate.role !== 'admin' && !removalCandidate.isDeleted && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRemovalTarget(removalCandidate)}
                      >
                        <UserX className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
              This uses the existing admin removal flow and blocks the account identity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Remove <span className="font-medium">{removalTarget?.name || removalTarget?.email}</span> from the platform?
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Reason *</label>
              <Textarea
                value={removalReason}
                onChange={event => setRemovalReason(event.target.value)}
                placeholder="Suspicious activity review reason"
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
                <UserX className="h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SuspiciousActivityPage() {
  return (
    <Suspense fallback={null}>
      <SuspiciousActivityContent />
    </Suspense>
  )
}
