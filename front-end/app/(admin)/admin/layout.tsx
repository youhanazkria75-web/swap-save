'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Users, Package, ArrowLeftRight, Clock,
  Flag, BarChart3, CreditCard, Menu, X,
  ChevronRight, LogOut,
  ShieldCheck, AlertTriangle, MessageSquare, Inbox,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useApp } from '@/contexts/app-context'
import { cn } from '@/lib/utils'
import { fetchAdminDashboardStats } from '@/lib/admin-dashboard-api'
import { fetchAdminSuspiciousActivity } from '@/lib/admin-suspicious-activity-api'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { href: '/admin',             icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/admin/approvals',   icon: Clock,           label: 'Pending Approvals', badge: 'approvals' },
      { href: '/admin/analytics',   icon: BarChart3,       label: 'Analytics' },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/admin/users',       icon: Users,           label: 'Users' },
      { href: '/admin/products',    icon: Package,         label: 'Products' },
      { href: '/admin/swaps',       icon: ArrowLeftRight,  label: 'Swaps' },
      { href: '/admin/transactions',icon: CreditCard,      label: 'Transactions' },
    ],
  },
  {
    label: 'Moderation',
    items: [
      { href: '/admin/reports',     icon: Flag,            label: 'Reports & Disputes', badge: 'reports' },
      { href: '/admin/support',     icon: Inbox,           label: 'Support Inbox', badge: 'support' },
      { href: '/admin/suspicious-activity', icon: AlertTriangle, label: 'Suspicious Activity', badge: 'suspicious' },
      { href: '/admin/discussions', icon: MessageSquare,   label: 'Discussion Review' },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [adminCounts, setAdminCounts] = useState({
    pendingApprovals: 0,
    openReports: 0,
    openSupport: 0,
    suspicious: 0,
  })
  const { isAuthenticated, hasHydrated, getCurrentUser, logout } = useApp()
  const user = getCurrentUser()

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    if (!user?.isAdmin) {
      router.push('/user/dashboard')
    }
  }, [hasHydrated, isAuthenticated, user, router])

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !user?.isAdmin) return

    let cancelled = false

    const loadAdminCounts = async () => {
      try {
        const [stats, suspicious] = await Promise.all([
          fetchAdminDashboardStats(),
          fetchAdminSuspiciousActivity(),
        ])
        if (cancelled) return
        setAdminCounts({
          pendingApprovals: stats.pending_approvals,
          openReports: stats.reports_needing_review,
          openSupport: stats.support_messages_needing_review,
          suspicious: suspicious.summary.total,
        })
      } catch {
        if (!cancelled) {
          setAdminCounts(current => ({ ...current, suspicious: 0 }))
        }
      }
    }

    loadAdminCounts()
    window.addEventListener('focus', loadAdminCounts)
    window.addEventListener('admin-counts-refresh', loadAdminCounts)

    return () => {
      cancelled = true
      window.removeEventListener('focus', loadAdminCounts)
      window.removeEventListener('admin-counts-refresh', loadAdminCounts)
    }
  }, [hasHydrated, isAuthenticated, pathname, user?.isAdmin])

  if (!hasHydrated) return null
  if (!isAuthenticated || !user?.isAdmin) return null

  const pendingApprovals = adminCounts.pendingApprovals

  const getBadge = (key: string) => {
    if (key === 'approvals') return pendingApprovals
    if (key === 'reports') return adminCounts.openReports
    if (key === 'support') return adminCounts.openSupport
    if (key === 'suspicious') return adminCounts.suspicious
    return 0
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
          <ShieldCheck className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none">Swap & Save</p>
          <p className="text-[10px] text-muted-foreground">Admin Panel</p>
        </div>
        <button
          className="ml-auto lg:hidden p-1 hover:bg-muted rounded"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ href, icon: Icon, label, badge }) => {
                const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
                const count = badge ? getBadge(badge) : 0
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{label}</span>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold px-1">
                        {count}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: user and back to site */}
      <div className="border-t border-border p-3 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to site
        </Link>
        <button
          onClick={() => { logout(); router.push('/login') }}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
        <div className="flex items-center gap-2.5 px-3 py-2 mt-1 border-t border-border pt-3">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">AD</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{user.firstName} {user.lastName}</p>
            <p className="text-[10px] text-muted-foreground">Administrator</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-muted/30 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-card border-r border-border">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-56 bg-card border-r border-border flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 px-4 sm:px-6 bg-card border-b border-border shrink-0">
          <button
            className="lg:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold hidden sm:block">
              {NAV_SECTIONS.flatMap(s => s.items).find(i => pathname === i.href || (i.href !== '/admin' && pathname.startsWith(i.href)))?.label || 'Admin Dashboard'}
            </p>
          </div>
          {pendingApprovals > 0 && (
            <Link
              href="/admin/approvals"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              <Clock className="h-3.5 w-3.5" />
              {pendingApprovals} pending approval{pendingApprovals !== 1 ? 's' : ''}
            </Link>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
