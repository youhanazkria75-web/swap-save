'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, CheckCheck, ArrowLeftRight, Star, DollarSign, ShieldCheck, MessageSquare, Truck, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchNotificationsWithCount,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_COUNT_EVENT,
  NOTIFICATION_REFRESH_EVENT,
} from '@/lib/notifications-api'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { useApp } from '@/contexts/app-context'
import type { Notification, NotificationType } from '@/types'

const TYPE_CONFIG: Record<NotificationType, { icon: any; color: string }> = {
  'swap-request':   { icon: ArrowLeftRight, color: 'bg-blue-100 text-blue-600' },
  'swap-accepted':  { icon: Check,          color: 'bg-green-100 text-green-600' },
  'swap-rejected':  { icon: ArrowLeftRight, color: 'bg-red-100 text-red-600' },
  'swap-approved':  { icon: ShieldCheck,    color: 'bg-primary/10 text-primary' },
  'swap-completed': { icon: CheckCheck,     color: 'bg-green-100 text-green-600' },
  'message':        { icon: MessageSquare,  color: 'bg-purple-100 text-purple-600' },
  'payment':        { icon: DollarSign,     color: 'bg-amber-100 text-amber-600' },
  'rating':         { icon: Star,           color: 'bg-amber-100 text-amber-600' },
  'system':         { icon: Bell,           color: 'bg-muted text-muted-foreground' },
  'delivery':       { icon: Truck,          color: 'bg-blue-100 text-blue-600' },
  'report':         { icon: ShieldCheck,    color: 'bg-red-100 text-red-600' },
  'promotion':      { icon: Bell,           color: 'bg-teal-100 text-teal-600' },
  'weekly-digest':  { icon: Bell,           color: 'bg-blue-100 text-blue-600' },
}

type NotificationFilter = 'all' | 'unread' | 'read'

const FILTER_OPTIONS: Array<{ value: NotificationFilter; label: string }> = [
  { value: 'all', label: 'Show all' },
  { value: 'unread', label: 'Unread only' },
  { value: 'read', label: 'Read only' },
]

const getSafeNotificationTarget = (notification: Notification) => {
  const target = notification.actionUrl || notification.targetUrl || ''

  if (target.startsWith('/') && !target.startsWith('//')) {
    return target
  }

  return '/user/notifications'
}

export default function NotificationsPage() {
  const router = useRouter()
  const { refreshWallet } = useApp()
  const filterDropdownRef = useRef<HTMLDivElement | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all')
  const [filterOpen, setFilterOpen] = useState(false)

  const loadNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true)
    }

    try {
      refreshWallet().catch(() => {})
      const { notifications: items, unreadCount: nextUnreadCount } = await fetchNotificationsWithCount()
      setNotifications(items)
      setUnreadCount(nextUnreadCount)
    } catch {
      setNotifications([])
      setUnreadCount(0)
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [refreshWallet])

  useEffect(() => {
    let cancelled = false

    const handleCountChanged = (event: Event) => {
      const count = Number((event as CustomEvent<{ unreadCount?: number }>).detail?.unreadCount ?? 0)
      if (!cancelled) {
        setUnreadCount(Number.isFinite(count) ? count : 0)
      }
    }

    const handleRefresh = () => {
      if (!cancelled) {
        loadNotifications(false).catch(() => {})
      }
    }

    loadNotifications(true).catch(() => {})
    window.addEventListener(NOTIFICATION_COUNT_EVENT, handleCountChanged)
    window.addEventListener(NOTIFICATION_REFRESH_EVENT, handleRefresh)

    return () => {
      cancelled = true
      window.removeEventListener(NOTIFICATION_COUNT_EVENT, handleCountChanged)
      window.removeEventListener(NOTIFICATION_REFRESH_EVENT, handleRefresh)
    }
  }, [loadNotifications])

  useEffect(() => {
    if (!filterOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!filterDropdownRef.current?.contains(event.target as Node)) {
        setFilterOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [filterOpen])

  const handleMarkRead = async (id: string) => {
    const currentNotification = notifications.find((notification) => notification.id === id)
    if (!currentNotification || currentNotification.isRead) return

    try {
      const { notification: updatedNotification, unreadCount: nextUnreadCount } = await markNotificationRead(id)
      setUnreadCount(nextUnreadCount)
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? updatedNotification || { ...notification, isRead: true }
            : notification
        )
      )
    } catch {
      await loadNotifications(false).catch(() => {})
    }
  }

  const handleMarkAllRead = async () => {
    try {
      const { unreadCount: nextUnreadCount } = await markAllNotificationsRead()
      setUnreadCount(nextUnreadCount)
      setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })))
    } catch {
      await loadNotifications(false).catch(() => {})
    }
  }

  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.isRead) {
      await handleMarkRead(notif.id)
    }

    router.push(getSafeNotificationTarget(notif))
  }

  const visibleNotifications = notifications.filter((notification) => {
    if (notificationFilter === 'unread') return !notification.isRead
    if (notificationFilter === 'read') return notification.isRead
    return true
  })

  const emptyTitle =
    notificationFilter === 'unread'
      ? 'No unread notifications'
      : notificationFilter === 'read'
        ? 'No read notifications'
        : 'No notifications yet'
  const emptyDescription =
    notificationFilter === 'all'
      ? "We'll notify you when something happens"
      : 'Try another filter to view more notifications'
  const activeFilterLabel = FILTER_OPTIONS.find(option => option.value === notificationFilter)?.label || 'Show all'

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading ? 'Loading...' : unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          )}
          <div ref={filterDropdownRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(current => !current)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {activeFilterLabel}
              <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', filterOpen && 'rotate-180')} />
            </button>
            {filterOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-border bg-card p-1.5 shadow-lg"
              >
                {FILTER_OPTIONS.map(option => {
                  const selected = option.value === notificationFilter

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setNotificationFilter(option.value)
                        setFilterOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <span>{option.label}</span>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {!loading && visibleNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-muted-foreground">{emptyTitle}</p>
          <p className="text-sm text-muted-foreground mt-1">{emptyDescription}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleNotifications.map(notif => {
            const { icon: Icon, color } = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system
            return (
              <div
                key={notif.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-4 py-2.5 transition-all cursor-pointer',
                  notif.isRead
                    ? 'bg-card border-border hover:shadow-card'
                    : 'bg-primary/5 border-primary/20 hover:shadow-card'
                )}
                onClick={() => {
                  void handleNotificationClick(notif)
                }}
              >
                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm', notif.isRead ? 'font-normal' : 'font-semibold')}>{notif.title}</p>
                    {!notif.isRead && <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
