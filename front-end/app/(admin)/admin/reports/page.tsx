'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ExternalLink, Flag, Search, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/form-elements'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/primitives'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/primitives'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  fetchAdminReports,
  resolveAdminReport,
  type AdminReport,
  type AdminReportResolutionAction,
} from '@/lib/admin-reports-api'
import { getEnumSearchParam, getSearchParam } from '@/lib/admin-query-params'
import type { ReportTarget } from '@/types'

type ActionTarget = { id: string; action: AdminReportResolutionAction }

const PAGE_SIZE = 50

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved: 'bg-green-50 text-green-700 border-green-200',
  dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
}

const TARGET_LABELS: Record<ReportTarget | 'all', string> = {
  all: 'All targets',
  swap: 'Swap disputes',
  message: 'Messages',
  product: 'Products',
  user: 'Users',
}

const formatValue = (value?: string) =>
  value ? value.replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '-'

const isOpenReport = (report: AdminReport) => report.status === 'open' || report.status === 'under_review'

const REPORT_STATUS_FILTERS = ['all', 'open', 'under_review', 'resolved', 'dismissed'] as const
const REPORT_TARGET_FILTERS = ['all', 'swap', 'message', 'product', 'user'] as const

function AdminReportsContent() {
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const [allReports, setAllReports] = useState<AdminReport[]>([])
  const [loading, setLoading] = useState(true)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [processing, setProcessing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    getEnumSearchParam(searchParams, 'status', REPORT_STATUS_FILTERS, 'all')
  )
  const [targetTypeFilter, setTargetTypeFilter] = useState<ReportTarget | 'all'>(() =>
    getEnumSearchParam(searchParams, 'target_type', REPORT_TARGET_FILTERS, 'all')
  )
  const [search, setSearch] = useState(() => getSearchParam(searchParams, 'q'))
  const [activeTab, setActiveTab] = useState<'reports' | 'disputes'>(() =>
    getEnumSearchParam(searchParams, 'target_type', REPORT_TARGET_FILTERS, 'all') === 'swap' ? 'disputes' : 'reports'
  )
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParamsKey)
    const nextTargetType = getEnumSearchParam(nextParams, 'target_type', REPORT_TARGET_FILTERS, 'all')

    setStatusFilter(getEnumSearchParam(nextParams, 'status', REPORT_STATUS_FILTERS, 'all'))
    setTargetTypeFilter(nextTargetType)
    setSearch(getSearchParam(nextParams, 'q'))
    setActiveTab(nextTargetType === 'swap' ? 'disputes' : 'reports')
    setPage(1)
  }, [searchParamsKey])

  const loadReports = useCallback(async () => {
    setLoading(true)

    try {
      const data = await fetchAdminReports({
        status: statusFilter,
        targetType: targetTypeFilter,
        q: search,
        page,
        limit: PAGE_SIZE,
      })
      setAllReports(data.reports)
      setTotal(data.total)
      setTotalPages(Math.max(data.totalPages || 1, 1))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load reports.')
      setAllReports([])
      setTotal(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, targetTypeFilter])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const reports = allReports.filter(report => report.targetType !== 'swap')
  const disputes = allReports.filter(report => report.targetType === 'swap')
  const openReports = reports.filter(isOpenReport)
  const openDisputes = disputes.filter(isOpenReport)

  const updateStatusFilter = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }

  const updateTargetTypeFilter = (value: ReportTarget | 'all') => {
    setTargetTypeFilter(value)
    if (value === 'swap') setActiveTab('disputes')
    if (value !== 'all' && value !== 'swap') setActiveTab('reports')
    setPage(1)
  }

  const handleAction = async () => {
    if (!actionTarget) return

    if (actionTarget.action !== 'dismiss' && !adminNote.trim()) {
      toast.error('Please add admin notes before continuing')
      return
    }

    setProcessing(true)

    try {
      const updatedReport = await resolveAdminReport(actionTarget.id, actionTarget.action, adminNote)
      setAllReports(current => current.map(report => report.id === updatedReport.id ? updatedReport : report))
      window.dispatchEvent(new Event('admin-counts-refresh'))
      toast.success(
        actionTarget.action === 'dismiss'
          ? 'Report dismissed'
          : actionTarget.action === 'cancel_swap'
            ? 'Swap cancelled'
            : 'Report resolved'
      )
      setActionTarget(null)
      setAdminNote('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update report.')
    } finally {
      setProcessing(false)
    }
  }

  const actionLabel = actionTarget?.action === 'cancel_swap'
    ? 'Cancel swap'
    : actionTarget?.action === 'continue_swap'
      ? 'Continue swap'
      : actionTarget?.action === 'resolve'
        ? 'Resolve report'
        : 'Dismiss report'

  const renderLinks = (report: AdminReport) => (
    <div className="flex gap-2 flex-wrap mt-3">
      {report.target.url && (
        <Button asChild size="sm" variant="outline">
          <Link href={report.target.url}>
            <ExternalLink className="h-3.5 w-3.5" />
            {report.targetType === 'message'
              ? 'View message context'
              : report.targetType === 'swap'
                ? 'View swap'
                : report.targetType === 'product'
                  ? 'Review products'
                  : 'Review users'}
          </Link>
        </Button>
      )}
      {report.swapId && report.targetType !== 'swap' && (
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/swaps/${report.swapId}`}>
            <ExternalLink className="h-3.5 w-3.5" /> View swap context
          </Link>
        </Button>
      )}
    </div>
  )

  const renderReportActions = (report: AdminReport) => {
    if (!isOpenReport(report)) return null

    if (report.targetType === 'swap') {
      return (
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <Button size="sm" variant="outline" onClick={() => setActionTarget({ id: report.id, action: 'dismiss' })}>
            Dismiss
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActionTarget({ id: report.id, action: 'continue_swap' })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Continue swap
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setActionTarget({ id: report.id, action: 'cancel_swap' })}>
            <XCircle className="h-3.5 w-3.5" /> Cancel swap
          </Button>
        </div>
      )
    }

    return (
      <div className="flex gap-2 shrink-0 flex-wrap justify-end">
        <Button size="sm" variant="outline" onClick={() => setActionTarget({ id: report.id, action: 'dismiss' })}>
          Dismiss
        </Button>
        <Button size="sm" onClick={() => setActionTarget({ id: report.id, action: 'resolve' })}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
        </Button>
      </div>
    )
  }

  const renderReportCard = (report: AdminReport, isDispute = false) => {
    const isOpen = isOpenReport(report)

    return (
      <div key={report.id} className={cn('bg-card rounded-2xl border p-5 transition-opacity', !isOpen && 'opacity-70')}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={report.targetType === 'user' ? 'info' : report.targetType === 'product' ? 'warning' : report.targetType === 'message' ? 'outline' : 'default'} className="capitalize">
              {isDispute ? 'dispute' : report.targetType}
            </Badge>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', STATUS_STYLES[report.status] || '')}>
              {formatValue(report.status)}
            </span>
            <span className="text-xs text-muted-foreground">ID: {report.id}</span>
          </div>
          {renderReportActions(report)}
        </div>

        <h3 className="font-semibold mb-1">{report.reason}</h3>
        <p className="text-sm text-muted-foreground mb-3">{report.description || 'No description provided.'}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>Target: <strong className="text-foreground">{report.target.label || report.targetId}</strong></span>
          {report.swapId && (
            <span>Swap: <strong className="text-foreground">{report.swapId}</strong></span>
          )}
          <span>By: <strong className="text-foreground">{report.reporter?.name || report.reporter?.email || 'Unknown user'}</strong></span>
          {report.previousSwapStatus && (
            <span>Previous status: <strong className="text-foreground">{formatValue(report.previousSwapStatus)}</strong></span>
          )}
          {report.currentSwapStatus && (
            <span>Current status: <strong className="text-foreground">{formatValue(report.currentSwapStatus)}</strong></span>
          )}
          {report.resolutionAction && (
            <span>Resolution: <strong className="text-foreground">{formatValue(report.resolutionAction)}</strong></span>
          )}
          <span>{format(new Date(report.createdAt), 'MMM d, yyyy')}</span>
        </div>
        {report.targetType === 'message' && report.target.message?.report_reason && (
          <p className="mt-2 text-xs text-destructive">Message flag: {report.target.message.report_reason}</p>
        )}
        {renderLinks(report)}
        {report.resolvedAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Resolved by <strong className="text-foreground">{report.resolvedBy?.name || report.resolvedBy?.email || 'admin'}</strong> on {format(new Date(report.resolvedAt), 'MMM d, yyyy')}
          </p>
        )}
        {report.adminNotes && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">Admin notes</p>
            <p className="text-sm">{report.adminNotes}</p>
          </div>
        )}
      </div>
    )
  }

  const renderEmpty = (icon: typeof Flag, text = 'No reports found') => {
    const Icon = icon
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Icon className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p>{text}</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports & Disputes</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {total.toLocaleString()} matching reports
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open reports shown', count: openReports.length, color: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'Reports shown', count: reports.length, color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Open disputes shown', count: openDisputes.length, color: 'bg-orange-50 text-orange-700 border-orange-200' },
          { label: 'Disputes shown', count: disputes.length, color: 'bg-blue-50 text-blue-700 border-blue-200' },
        ].map(summary => (
          <div key={summary.label} className={`rounded-xl border px-4 py-3 ${summary.color}`}>
            <p className="text-xl font-bold">{summary.count}</p>
            <p className="text-xs font-medium opacity-80">{summary.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1) }}
            placeholder="Search reports, users, targets, reasons..."
            className="pl-10"
          />
        </div>
        <AdminFilterDropdown
          value={statusFilter}
          onChange={updateStatusFilter}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'open', label: 'Open' },
            { value: 'under_review', label: 'Under review' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'dismissed', label: 'Dismissed' },
          ]}
        />
        <AdminFilterDropdown
          value={targetTypeFilter}
          onChange={value => updateTargetTypeFilter(value as ReportTarget | 'all')}
          options={(['all', 'swap', 'message', 'product', 'user'] as const).map(targetType => ({
            value: targetType,
            label: TARGET_LABELS[targetType],
          }))}
        />
      </div>

      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'reports' | 'disputes')}>
        <TabsList>
          <TabsTrigger value="reports">
            Reports
            {openReports.length > 0 && (
              <Badge variant="rejected" className="ml-1.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full">
                {openReports.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="disputes">
            Disputes
            {openDisputes.length > 0 && (
              <Badge variant="warning" className="ml-1.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full">
                {openDisputes.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-5 space-y-3">
          {loading && renderEmpty(Flag, 'Loading reports...')}
          {!loading && allReports.length === 0 && renderEmpty(Flag)}
          {!loading && allReports.length > 0 && reports.length === 0 && renderEmpty(Flag)}
          {!loading && reports.map(report => renderReportCard(report))}
        </TabsContent>

        <TabsContent value="disputes" className="mt-5 space-y-3">
          {loading && renderEmpty(AlertTriangle, 'Loading disputes...')}
          {!loading && allReports.length === 0 && renderEmpty(AlertTriangle)}
          {!loading && allReports.length > 0 && disputes.length === 0 && renderEmpty(AlertTriangle)}
          {!loading && disputes.map(report => renderReportCard(report, true))}
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(value - 1, 1))}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </div>

      <Dialog open={!!actionTarget} onOpenChange={() => { setActionTarget(null); setAdminNote('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionLabel}</DialogTitle>
            <DialogDescription>
              {actionTarget?.action === 'dismiss'
                ? 'Add optional notes explaining the decision.'
                : 'Admin notes are required for this decision.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={adminNote}
              onChange={event => setAdminNote(event.target.value)}
              placeholder="Admin notes..."
              rows={3}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setActionTarget(null); setAdminNote('') }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAction}
                loading={processing}
                disabled={processing || (actionTarget?.action !== 'dismiss' && !adminNote.trim())}
              >
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={null}>
      <AdminReportsContent />
    </Suspense>
  )
}
