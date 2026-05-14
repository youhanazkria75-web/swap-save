'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Bell, Menu, X, ArrowLeftRight, Search, ChevronDown,
  User, Settings, LogOut, ShieldCheck, Package,
  Heart, Coins, Plus, LayoutDashboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useApp } from '@/contexts/app-context'
import { cn } from '@/lib/utils'
import {
  fetchUnreadCount,
  NOTIFICATION_COUNT_EVENT,
  NOTIFICATION_REFRESH_EVENT,
} from '@/lib/notifications-api'

const NAV_LINKS = [
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/categories', label: 'Categories' },
  { href: '/about', label: 'About' },
  { href: '/help', label: 'Help' },
]

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { isAuthenticated, getCurrentUser, logout } = useApp()
  const user = getCurrentUser()
  const userId = user?.id
  const [unread, setUnread] = useState(0)
  const [profileOverride, setProfileOverride] = useState<{ firstName: string; lastName: string; avatar?: string } | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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
      if (!isAuthenticated || !userId) {
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
  }, [isAuthenticated, pathname, userId])

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const displayUser = user && profileOverride ? { ...user, ...profileOverride } : user
  const initials = displayUser
    ? `${displayUser.firstName[0]}${displayUser.lastName[0]}`.toUpperCase()
    : ''

  // Hide navbar inside admin panel
  if (pathname.startsWith('/admin')) return null

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full transition-all duration-200',
        scrolled
          ? 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border shadow-sm'
          : 'bg-background border-b border-border'
      )}
    >
      <div className="page-container">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
              <ArrowLeftRight className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              Swap<span className="gradient-text">&Save</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === link.href || pathname.startsWith(link.href + '/')
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Search */}
          <div className="hidden lg:flex flex-1 max-w-xs">
            <Link
              href="/marketplace"
              className="flex items-center gap-2 w-full h-9 px-3 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground hover:border-border hover:bg-muted transition-colors"
            >
              <Search className="h-4 w-4" />
              <span>Search products...</span>
            </Link>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <>
                {/* Coin balance */}
                <Link href="/user/coins" className="hidden lg:flex coin-pill hover:bg-amber-100 transition-colors">
                  <span>🪙</span>
                  <span>{user.coinBalance.toLocaleString()}</span>
                </Link>

                {/* Notifications */}
                <Link href="/user/notifications" className="relative">
                  <Button variant="ghost" size="icon">
                    <Bell className="h-4 w-4" />
                  </Button>
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </Link>

                {/* User menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted transition-colors outline-none">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={displayUser?.avatar} alt={displayUser?.firstName} />
                        <AvatarFallback className="text-xs bg-brand-100 text-brand-700">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="hidden lg:block text-sm font-medium max-w-24 truncate">{displayUser?.firstName}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden lg:block" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium">{displayUser?.firstName} {displayUser?.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/user/dashboard" className="cursor-pointer">
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/user/products" className="cursor-pointer">
                        <Package className="h-4 w-4" /> My Products
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/user/swaps" className="cursor-pointer">
                        <ArrowLeftRight className="h-4 w-4" /> My Swaps
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/user/saved" className="cursor-pointer">
                        <Heart className="h-4 w-4" /> Saved Items
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/user/coins" className="cursor-pointer">
                        <span className="text-sm">🪙</span> Coins ({user.coinBalance})
                      </Link>
                    </DropdownMenuItem>
                    {user.isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href="/admin" className="cursor-pointer text-primary">
                            <ShieldCheck className="h-4 w-4" /> Admin Panel
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/user/settings" className="cursor-pointer">
                        <Settings className="h-4 w-4" /> Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" /> Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Add product CTA */}
                <Button asChild size="sm" className="hidden lg:flex">
                  <Link href="/user/products/new">
                    <Plus className="h-3.5 w-3.5" />
                    Add Product
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Sign up free</Link>
                </Button>
              </>
            )}

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background animate-fade-in">
          <div className="page-container py-4 space-y-1">
            {/* Mobile search */}
            <Link
              href="/marketplace"
              className="flex items-center gap-2 w-full h-10 px-3 rounded-lg border border-input bg-muted/50 text-sm text-muted-foreground mb-3"
            >
              <Search className="h-4 w-4" />
              <span>Search products...</span>
            </Link>

            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {link.label}
              </Link>
            ))}

            {isAuthenticated && (
              <>
                <div className="h-px bg-border my-2" />
                <Link href="/user/dashboard" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard
                </Link>
                <Link href="/user/products/new" className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted">
                  <Plus className="h-4 w-4" /> Add Product
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </>
            )}

            {!isAuthenticated && (
              <>
                <div className="h-px bg-border my-2" />
                <div className="flex gap-2 pt-1">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button asChild className="flex-1">
                    <Link href="/signup">Sign up</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
