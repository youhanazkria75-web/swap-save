'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Eye, Flag, MessageSquare, Search, ShieldCheck, UserX } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/form-elements'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import {
  fetchAdminReports,
  resolveAdminReport,
  type AdminReport,
  type AdminReportResolutionAction,
  type AdminReportUser,
} from '@/lib/admin-reports-api'
import { removeAdminUserFromPlatform } from '@/lib/admin-users-api'
import { getEnumSearchParam, getSearchParam } from '@/lib/admin-query-params'
import { cn } from '@/lib/utils'

const DISCUSSION_STATUS_FILTERS = ['open', 'under_review', 'resolved', 'dismissed', 'all'] as const

const statusBadgeVariant = (status: string) => {
  if (status === 'resolved' || status === 'dismissed') return 'outline'
  if (status === 'under_review') return 'warning'
  return 'rejected'
}

const formatLabel = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())

const initialsFor = (user?: AdminReportUser | null) => {
  const first = user?.firstName?.[0] || user?.name?.[0] || user?.email?.[0] || 'U'
  const last = user?.lastName?.[0] || ''
  return `${first}${last}`.toUpperCase()
}

function DiscussionsContent() {
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [reports, setReports] = useState<AdminReport[]>([])
  const [search, setSearch] = useState(() => getSearchParam(searchParams, 'q'))
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'status', DISCUSSION_STATUS_FILTERS, 'open')
  )
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<{ report: AdminReport; action: AdminReportResolutionAction } | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [removalTarget, setRemovalTarget] = useState<AdminReportUser | null>(null)
  const [removalReason, setRemovalReason] = useState('')

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsKey)

    setSearch(getSearchParam(nextParams, 'q'))
    setStatusFilter(getEnumSearchParam(nextParams, 'status', DISCUSSION_STATUS_FILTERS, 'open'))
  }, [searchParamsKey])

  const loadReports = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetchAdminReports({
        targetType: 'message',
        status: statusFilter,
        q: search,
        limit: 100,
      })
      setReports(response.reports)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load reported discussions')
      setReports([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const senderReportCounts = useMemo(() => {
    const counts = new Map<string, number>()

    reports.forEach(report => {
      const senderId = report.target.message?.sender?.id
      if (!senderId) return
      counts.set(senderId, (counts.get(senderId) || 0) + 1)
    })

    return counts
  }, [reports])

  const openReports = reports.filter(report => report.status === 'open' || report.status === 'under_review')

  const openReviewDialog = (report: AdminReport, action: AdminReportResolutionAction) => {
    setReviewTarget({ report, action })
    setReviewNotes('')
  }

  const handleReviewReport = async () => {
    if (!reviewTarget) return

    if (reviewTarget.action === 'resolve' && reviewNotes.trim().length < 5) {
      toast.error('Resolution notes must be at least 5 characters.')
      return
    }

    setProcessing(true)

    try {
      const updated = await resolveAdminReport(reviewTarget.report.id, reviewTarget.action, reviewNotes.trim())
      setReports(current => current.map(report => report.id === updated.id ? updated : report))
      setReviewTarget(null)
      setReviewNotes('')
      toast.success(reviewTarget.action === 'dismiss' ? 'Report dismissed' : 'Report resolved')
      loadReports()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update report')
    } finally {
      setProcessing(false)
    }
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
      await removeAdminUserFromPlatform(removalTarget.id, reason)
      setRemovalTarget(null)
      setRemovalReason('')
      toast.success('User removed from platform')
      loadReports()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove user from platform')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Discussion Review</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {openReports.length.toLocaleString()} open reported discussion{openReports.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {openReports.length > 0 && (
          <Badge className="bg-red-50 text-red-700 border-red-200 gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Needs review
          </Badge>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search reported messages, senders, or reasons..."
            className="pl-10"
          />
        </div>
        <AdminFilterDropdown
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'under_review', label: 'In review' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'dismissed', label: 'Dismissed' },
            { value: 'all', label: 'All statuses' },
          ]}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading reported discussions...</div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-lg border border-border">
          <CheckCircle2 className="h-12 w-12 text-green-500/40 mb-4" />
          <p className="font-semibold">No reported discussions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const message = report.target.message
            const sender = message?.sender
            const repeatCount = sender?.id ? senderReportCounts.get(sender.id) || 0 : 0
            const canRemoveSender = Boolean(sender?.id && sender.role !== 'admin' && !sender.isDeleted && repeatCount >= 2)

            return (
              <div key={report.id} className="bg-card rounded-lg border border-border p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={sender?.avatar} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{initialsFor(sender)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-semibold">{sender?.name || sender?.email || 'Unknown sender'}</h2>
                        <Badge variant={statusBadgeVariant(report.status)}>{formatLabel(report.status)}</Badge>
                        {message?.is_reported && <Badge variant="rejected">Message flagged</Badge>}
                      </div>
                      <p className="mt-2 text-sm bg-muted rounded-lg px-3 py-2">{message?.content || 'Message content unavailable'}</p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>
                          Reason:{' '}
                          <span className={cn(report.status === 'open' ? 'text-destructive' : 'text-foreground')}>
                            {report.reason || message?.report_reason || 'No reason provided'}
                          </span>
                        </p>
                        {report.description && <p>Description: {report.description}</p>}
                        <p>Reported by {report.reporter?.email || 'unknown'} on {format(new Date(report.createdAt), 'MMM d, yyyy h:mm a')}</p>
                        {report.resolvedAt && <p>Reviewed {format(new Date(report.resolvedAt), 'MMM d, yyyy h:mm a')}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap lg:justify-end gap-2 shrink-0">
                    {report.swapId && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/swaps/${report.swapId}`}>
                          <MessageSquare className="h-3.5 w-3.5" />
                          Swap
                        </Link>
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/reports?target_type=message&q=${encodeURIComponent(report.id)}`}>
                        <Eye className="h-3.5 w-3.5" />
                        Report
                      </Link>
                    </Button>
                    {(report.status === 'open' || report.status === 'under_review') && (
                      <>
                        <Button size="sm" variant="success" onClick={() => openReviewDialog(report, 'resolve')}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openReviewDialog(report, 'dismiss')}>
                          <Flag className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </>
                    )}
                    {canRemoveSender && sender && (
                      <Button size="sm" variant="destructive" onClick={() => setRemovalTarget(sender)}>
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
        open={!!reviewTarget}
        onOpenChange={open => {
          if (open) return
          setReviewTarget(null)
          setReviewNotes('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewTarget?.action === 'dismiss' ? 'Dismiss report' : 'Resolve report'}</DialogTitle>
            <DialogDescription>
              This updates the real report record for the reported message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {reviewTarget?.action === 'dismiss' ? 'Notes' : 'Resolution notes *'}
              </label>
              <Textarea
                value={reviewNotes}
                onChange={event => setReviewNotes(event.target.value)}
                placeholder="Review notes"
                rows={3}
              />
              {reviewTarget?.action === 'resolve' && (
                <p className="text-xs text-muted-foreground">Minimum 5 characters.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setReviewTarget(null)
                  setReviewNotes('')
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                variant={reviewTarget?.action === 'dismiss' ? 'outline' : 'success'}
                loading={processing}
                disabled={reviewTarget?.action === 'resolve' && reviewNotes.trim().length < 5}
                onClick={handleReviewReport}
              >
                {reviewTarget?.action === 'dismiss' ? 'Dismiss' : 'Resolve'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              This uses the existing admin removal flow for repeated message violations.
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
                placeholder="Repeated reported message violation"
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

export default function DiscussionsPage() {
  return (
    <Suspense fallback={null}>
      <DiscussionsContent />
    </Suspense>
  )
}
