'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, Package, ArrowLeftRight, Sparkles,
  Bell, Settings, Heart, Coins, User, ChevronRight,
  Menu, X, ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { Badge } from '@/components/ui/badge'
import { Navbar } from '@/components/shared/navbar'
import { useApp } from '@/contexts/app-context'
import { cn } from '@/lib/utils'
import {
  fetchUnreadCount,
  NOTIFICATION_COUNT_EVENT,
  NOTIFICATION_REFRESH_EVENT,
} from '@/lib/notifications-api'

const NAV_ITEMS = [
  { href: '/user/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/user/products',         icon: Package,         label: 'My Products' },
  { href: '/user/swaps',            icon: ArrowLeftRight,  label: 'My Swaps' },
  { href: '/user/ai-matches',       icon: Sparkles,        label: 'AI Matches' },
  { href: '/user/saved',            icon: Heart,           label: 'Saved Items' },
  { href: '/user/notifications',    icon: Bell,            label: 'Notifications' },
  { href: '/user/coins',            icon: Coins,           label: 'Coins' },
  { href: '/user/profile',          icon: User,            label: 'Profile' },
  { href: '/user/settings',         icon: Settings,        label: 'Settings' },
]

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    isAuthenticated,
    hasHydrated,
    getCurrentUser,
    sidebarOpen,
    setSidebarOpen,
    mobileNavOpen,
    setMobileNavOpen,
    refreshWallet,
  } = useApp()
  const user = getCurrentUser()
  const userId = user?.id
  const [unread, setUnread] = useState(0)
  const [profileOverride, setProfileOverride] = useState<{ firstName: string; lastName: string; avatar?: string } | null>(null)

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated) router.push('/login')
  }, [hasHydrated, isAuthenticated, router])

  useEffect(() => {
    setProfileOverride(null)
  }, [user?.id])

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      if (!user) return
      const detail = (event as CustomEvent<{ id?: string; firstName?: string; lastName?: string; avatar?: string }>).detail

      if (detail?.id !== user.id) return

      setProfileOverride({
        firstName: detail.firstName || user.firstName,
        lastName: detail.lastName || user.lastName,
        avatar: detail.avatar,
      })
    }

    window.addEventListener('account-profile-updated', handleProfileUpdated)
    return () => window.removeEventListener('account-profile-updated', handleProfileUpdated)
  }, [user])

  useEffect(() => {
    let cancelled = false

    const loadUnread = async () => {
      if (!hasHydrated || !isAuthenticated || !userId) {
        setUnread(0)
        return
      }

      try {
        const count = await fetchUnreadCount()
        if (!cancelled) {
          setUnread(count)
        }
      } catch {
        if (!cancelled) setUnread(0)
      }
    }

    const handleCountChanged = (event: Event) => {
      const count = Number((event as CustomEvent<{ unreadCount?: number }>).detail?.unreadCount ?? 0)
      setUnread(Number.isFinite(count) ? count : 0)
    }
    const handleRefresh = () => {
      loadUnread().catch(() => {})
    }

    loadUnread()
    window.addEventListener('focus', handleRefresh)
    window.addEventListener(NOTIFICATION_COUNT_EVENT, handleCountChanged)
    window.addEventListener(NOTIFICATION_REFRESH_EVENT, handleRefresh)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleRefresh)
      window.removeEventListener(NOTIFICATION_COUNT_EVENT, handleCountChanged)
      window.removeEventListener(NOTIFICATION_REFRESH_EVENT, handleRefresh)
    }
  }, [hasHydrated, isAuthenticated, pathname, userId])

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !userId) return

    const handleFocus = () => {
      refreshWallet().catch(() => {})
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [hasHydrated, isAuthenticated, refreshWallet, userId])

  if (!hasHydrated) return null
  if (!isAuthenticated || !user) return null

  const displayUser = profileOverride ? { ...user, ...profileOverride } : user
  const initials = `${displayUser.firstName[0]}${displayUser.lastName[0]}`.toUpperCase()

  const Sidebar = () => (
    <aside className={cn(
      'flex flex-col h-full bg-card border-r border-border transition-all duration-200',
      sidebarOpen ? 'w-56' : 'w-16'
    )}>
      {/* User summary */}
      <div className={cn('p-4 border-b border-border', !sidebarOpen && 'px-2')}>
        <div className={cn('flex items-center gap-3', !sidebarOpen && 'justify-center')}>
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={displayUser.avatar} />
            <AvatarFallback className="text-xs bg-brand-100 text-brand-700">{initials}</AvatarFallback>
          </Avatar>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{displayUser.firstName} {displayUser.lastName}</p>
              <p className="text-[11px] text-muted-foreground">🪙 {user.coinBalance} coins</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const isNotif = href === '/user/notifications'
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                !sidebarOpen && 'justify-center px-2'
              )}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span>{label}</span>}
              {isNotif && unread > 0 && (
                <span className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white text-[10px] font-bold',
                  sidebarOpen ? 'ml-auto' : 'absolute top-1 right-1'
                )}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Admin link */}
      {user.isAdmin && (
        <div className={cn('p-2 border-t border-border', !sidebarOpen && 'px-2')}>
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors',
              !sidebarOpen && 'justify-center px-2'
            )}
            title={!sidebarOpen ? 'Admin Panel' : undefined}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span>Admin Panel</span>}
          </Link>
        </div>
      )}

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border hidden lg:block">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex w-full items-center justify-center gap-2 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
        >
          {sidebarOpen
            ? <><X className="h-3.5 w-3.5" /> <span>Collapse</span></>
            : <ChevronRight className="h-3.5 w-3.5" />
          }
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:block shrink-0">
          <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-hidden">
            <Sidebar />
          </div>
        </div>

        {/* Mobile sidebar overlay */}
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
            <div className="relative w-64 h-full bg-card">
              <Sidebar />
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-2 border-b border-border bg-background sticky top-0 z-30">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              {NAV_ITEMS.find(n => pathname.startsWith(n.href))?.icon &&
                (() => {
                  const item = NAV_ITEMS.find(n => pathname === n.href || pathname.startsWith(n.href + '/'))
                  if (!item) return null
                  const Icon = item.icon
                  return <Icon className="h-4 w-4 text-muted-foreground" />
                })()
              }
              <span className="text-sm font-medium">
                {NAV_ITEMS.find(n => pathname === n.href || pathname.startsWith(n.href + '/'))?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
