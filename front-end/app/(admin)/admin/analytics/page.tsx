'use client'

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Users, Coins, Package } from 'lucide-react'
import { StatsCard } from '@/components/shared/stats-card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  emptyAdminDashboardStats,
  fetchAdminDashboardStats,
  type AdminDashboardStats,
} from '@/lib/admin-dashboard-api'

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

const REVIEW_LABELS: Record<string, string> = {
  open: 'Open',
  in_review: 'In Review',
  under_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
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

const COLORS = ['#16a34a', '#0d9488', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444']

const toChartData = (counts: Record<string, number>, labels: Record<string, string>) =>
  Object.keys(labels).map(key => ({
    key,
    name: labels[key],
    count: Number(counts[key] || 0),
  }))

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AdminDashboardStats>(emptyAdminDashboardStats)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadAnalytics = async () => {
      try {
        setLoading(true)
        const nextStats = await fetchAdminDashboardStats()
        if (!cancelled) {
          setStats(nextStats)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAnalytics()

    return () => {
      cancelled = true
    }
  }, [])

  const completionRate = stats.total_swaps > 0
    ? Math.round((stats.completed_swaps / stats.total_swaps) * 1000) / 10
    : 0
  const swapStatusData = useMemo(() => toChartData(stats.swap_statuses, SWAP_STATUS_LABELS), [stats.swap_statuses])
  const productStatusData = useMemo(() => toChartData(stats.product_statuses, PRODUCT_STATUS_LABELS), [stats.product_statuses])
  const reviewData = useMemo(() => [
    ...toChartData(stats.report_statuses, REVIEW_LABELS).map(item => ({ ...item, group: 'Reports' })),
    ...toChartData(stats.support_statuses, REVIEW_LABELS).map(item => ({ ...item, group: 'Support' })),
  ].filter(item => item.count > 0), [stats.report_statuses, stats.support_statuses])
  const deliveryData = useMemo(() => toChartData(stats.delivery_statuses, DELIVERY_STATUS_LABELS), [stats.delivery_statuses])
  const categories = useMemo(() =>
    stats.category_breakdown
      .map(item => ({ name: item.name || item.category, value: Number(item.count || 0) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    [stats.category_breakdown]
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Backend-driven platform counts</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Coin Transactions" value={loading ? '-' : stats.total_coin_transactions.toLocaleString()} icon={Coins} color="green" subtitle={`${stats.admin_adjustments_count.toLocaleString()} admin adjustments`} />
        <StatsCard title="Total Users" value={loading ? '-' : stats.total_users.toLocaleString()} icon={Users} color="blue" subtitle={stats.active_users_available ? `${stats.active_users?.toLocaleString()} active` : 'Not tracked yet'} />
        <StatsCard title="Products" value={loading ? '-' : stats.total_products.toLocaleString()} icon={Package} color="amber" subtitle={`${stats.featured_products.toLocaleString()} featured`} />
        <StatsCard title="Completion Rate" value={loading ? '-' : `${completionRate}%`} icon={TrendingUp} color="purple" subtitle="Completed swaps / total swaps" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-5">Swap status distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={swapStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-25} textAnchor="end" height={58} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#16a34a" name="Swaps" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-5">Product status distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-25} textAnchor="end" height={58} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#f59e0b" name="Products" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-5">Reports and support status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reviewData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey={(item) => `${item.group}: ${item.name}`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval={0} angle={-20} textAnchor="end" height={58} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3b82f6" name="Items" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5">
          <h3 className="font-semibold mb-5">Top categories</h3>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-16 text-center">No category data yet</p>
          ) : (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categories} cx="50%" cy="50%" outerRadius={65} dataKey="value" label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {categories.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {categories.map((category, index) => (
                  <div key={category.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span>{category.name}</span>
                    </div>
                    <span className="text-muted-foreground font-medium">{category.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <h3 className="font-semibold mb-5">Delivery lifecycle</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deliveryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" fill="#0d9488" name="Deliveries" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
