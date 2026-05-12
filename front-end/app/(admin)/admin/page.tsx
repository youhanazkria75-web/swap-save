'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Users, Package, ArrowLeftRight, Clock, XCircle,
  ChevronRight, Flag, Coins, Inbox, CreditCard,
  AlertTriangle, MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatsCard } from '@/components/shared/stats-card'
import { SwapStatusBadge } from '@/components/shared/status-badges'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  emptyAdminDashboardStats,
  fetchAdminDashboardStats,
  type AdminDashboardStats,
} from '@/lib/admin-dashboard-api'
import type { SwapStatus } from '@/types'

const SWAP_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_discussion: 'In Discussion',
  under_review: 'Under Review',
  approved: 'Approved',
  payment_pending: 'Payment Pending',
  exchange_setup: 'Exchange Setup',
  in_progress: 'In Progress',
  completed: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  reserved: 'Reserved',
  swapped: 'Swapped',
  inactive: 'Inactive',
  rejected: 'Rejected',
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending_pickup: 'Pending Pickup',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered_to_receiver: 'Delivered',
  delivery_completed: 'Completed',
}

const toChartData = (counts: Record<string, number>, labels: Record<string, string>) =>
  Object.keys(labels).map(key => ({
    key,
    name: labels[key],
    count: Number(counts[key] || 0),
  }))

const getUserName = (user?: { name?: string; first_name?: string; last_name?: string } | null) =>
  user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unknown user'

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats>(emptyAdminDashboardStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError('')
      setStats(await fetchAdminDashboardStats())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard.')
      setStats(emptyAdminDashboardStats)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        setLoading(true)
        setError('')
        const nextStats = await fetchAdminDashboardStats()
        if (!cancelled) setStats(nextStats)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard.')
          setStats(emptyAdminDashboardStats)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [])

  const swapChartData = useMemo(() => toChartData(stats.swap_statuses, SWAP_STATUS_LABELS), [stats.swap_statuses])
  const productChartData = useMemo(() => toChartData(stats.product_statuses, PRODUCT_STATUS_LABELS), [stats.product_statuses])
  const deliveryChartData = useMemo(() => toChartData(stats.delivery_statuses, DELIVERY_STATUS_LABELS), [stats.delivery_statuses])

  const activityFeed = useMemo(() => {
    const activities = [
      ...stats.latest_swaps.map(swap => ({
        id: `swap-${swap.id}`,
        href: `/admin/swaps/${swap.id}`,
        icon: ArrowLeftRight,
        color: 'bg-blue-100 text-blue-600',
        text: `Swap ${SWAP_STATUS_LABELS[swap.status] || swap.status}: ${swap.product_offered?.title || 'Offered item'} for ${swap.product_requested?.title || 'requested item'}`,
        createdAt: swap.updatedAt || swap.createdAt,
      })),
      ...stats.latest_reports.map(report => ({
        id: `report-${report.id}`,
        href: '/admin/reports',
        icon: Flag,
        color: 'bg-red-100 text-red-600',
        text: `${report.status.replace(/_/g, ' ')} ${report.target_type} report: ${report.reason}`,
        createdAt: report.createdAt,
      })),
      ...stats.latest_support_messages.map(message => ({
        id: `support-${message.id}`,
        href: '/admin/support',
        icon: Inbox,
        color: 'bg-amber-100 text-amber-600',
        text: `${message.inquiry_type} support: ${message.subject}`,
        createdAt: message.createdAt,
      })),
      ...stats.latest_transactions.map(transaction => ({
        id: `transaction-${transaction.id}`,
        href: '/admin/transactions',
        icon: CreditCard,
        color: 'bg-teal-100 text-teal-600',
        text: `${transaction.direction} ${transaction.amount} coins: ${transaction.description || transaction.type}`,
        createdAt: transaction.createdAt,
      })),
    ]

    return activities
      .filter(activity => activity.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
  }, [stats])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {format(new Date(), 'EEEE, MMMM d yyyy')} - Platform overview
          </p>
        </div>
        {stats.pending_approvals > 0 && (
          <Button asChild className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
            <Link href="/admin/approvals">
              <Clock className="h-4 w-4" />
              {stats.pending_approvals} Pending Approval{stats.pending_approvals !== 1 ? 's' : ''}
            </Link>
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadDashboard}>Retry</Button>
          </div>
        </div>
      )}

      {/* Primary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatsCard
          title="Total Users"
          value={loading ? '-' : stats.total_users}
          subtitle={stats.deleted_users > 0 ? `${stats.deleted_users.toLocaleString()} deleted/anonymized` : `${stats.regular_users.toLocaleString()} members`}
          icon={Users}
          color="blue"
        />
        <StatsCard
          title="Products"
          value={loading ? '-' : stats.total_products}
          subtitle={`${stats.available_products.toLocaleString()} available - ${stats.reserved_products.toLocaleString()} reserved`}
          icon={Package}
          color="green"
        />
        <StatsCard
          title="Swaps"
          value={loading ? '-' : stats.total_swaps}
          subtitle={`${stats.completed_swaps.toLocaleString()} completed`}
          icon={ArrowLeftRight}
          color="teal"
        />
        <StatsCard
          title="Coin Transactions"
          value={loading ? '-' : stats.total_coin_transactions}
          subtitle={`${stats.total_coins_credited.toLocaleString()} credited - ${stats.total_coins_debited.toLocaleString()} debited`}
          icon={Coins}
          color="amber"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatsCard title="Pending Review" value={loading ? '-' : stats.pending_approvals} icon={Clock} color="amber" />
        <StatsCard title="Disputed" value={loading ? '-' : stats.disputed_swaps} icon={AlertTriangle} color="red" />
        <StatsCard title="Rejected" value={loading ? '-' : stats.rejected_swaps} icon={XCircle} color="red" />
        <StatsCard title="Reports" value={loading ? '-' : stats.reports_needing_review} subtitle={`${stats.resolved_reports.toLocaleString()} resolved`} icon={Flag} color="red" />
        <StatsCard title="Support" value={loading ? '-' : stats.support_messages_needing_review} icon={Inbox} color="blue" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="mb-5">
            <h3 className="font-semibold">Swap status counts</h3>
            <p className="text-xs text-muted-foreground">Current real swap distribution</p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={swapChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-25} textAnchor="end" height={58} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#0d9488" name="Swaps" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="mb-5">
            <h3 className="font-semibold">Product inventory</h3>
            <p className="text-xs text-muted-foreground">
              {stats.featured_products.toLocaleString()} featured - {stats.reported_products.toLocaleString()} reported
            </p>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#16a34a" name="Products" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <div className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Latest swaps</h3>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/swaps">View all <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="space-y-1">
            {stats.latest_swaps.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No swaps yet</p>
            )}
            {stats.latest_swaps.map(swap => (
              <Link
                key={swap.id}
                href={`/admin/swaps/${swap.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-1 shrink-0">
                  <div className="h-8 w-8 rounded-lg overflow-hidden bg-muted">
                    {swap.product_offered?.images?.[0] && <img src={swap.product_offered.images[0]} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                  <div className="h-8 w-8 rounded-lg overflow-hidden bg-muted">
                    {swap.product_requested?.images?.[0] && <img src={swap.product_requested.images[0]} alt="" className="h-full w-full object-cover" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{getUserName(swap.requester)} for {getUserName(swap.receiver)}</p>
                  <p className="text-xs text-muted-foreground truncate">{swap.product_offered?.title || 'Offered item'} for {swap.product_requested?.title || 'requested item'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <SwapStatusBadge status={swap.status as SwapStatus} />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold mb-3">Quick actions</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Review approvals', href: '/admin/approvals', icon: Clock, color: 'text-amber-600' },
                { label: 'Manage users', href: '/admin/users', icon: Users, color: 'text-blue-600' },
                { label: 'Open reports', href: '/admin/reports', icon: Flag, color: 'text-red-600' },
                { label: 'Support inbox', href: '/admin/support', icon: Inbox, color: 'text-blue-600' },
                { label: 'Transactions', href: '/admin/transactions', icon: CreditCard, color: 'text-teal-600' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex flex-col items-center gap-1.5 p-3 bg-muted/50 rounded-xl hover:bg-muted transition-colors text-center"
                >
                  <Icon className={cn('h-5 w-5', color)} />
                  <span className="text-xs font-medium leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold mb-3">Recent activity</p>
            <div className="space-y-3">
              {activityFeed.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">No activity yet</p>
              )}
              {activityFeed.map(({ id, href, icon: Icon, color, text, createdAt }) => (
                <Link key={id} href={href} className="flex items-start gap-2.5 rounded-lg hover:bg-muted/60 transition-colors p-1 -m-1">
                  <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug">{text}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {deliveryChartData.some(item => item.count > 0) && (
            <div className="bg-card rounded-2xl border border-border p-4">
              <p className="text-sm font-semibold mb-3">Delivery status</p>
              <div className="space-y-2">
                {deliveryChartData.map(item => (
                  <div key={item.key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="font-semibold">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
