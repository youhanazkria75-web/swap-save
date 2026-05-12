import type { Notification, NotificationType } from '@/types'

type BackendNotification = Record<string, unknown>

export const NOTIFICATION_COUNT_EVENT = 'swap-save:notification-count'
export const NOTIFICATION_REFRESH_EVENT = 'swap-save:notification-refresh'

import { API_BASE_URL as API_URL } from '@/lib/api-config'

const getToken = () =>
  typeof window === 'undefined' ? '' : localStorage.getItem('token') || ''

const getId = (value: unknown) => {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return String(record._id ?? record.id ?? '')
  }

  return String(value ?? '')
}

const getString = (item: BackendNotification, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }

  return ''
}

const getUnreadCount = (data: unknown) => {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Notification count response was invalid.')
  }

  const record = data as Record<string, unknown>
  const count = Number(record.unread_count ?? record.unreadCount)

  if (!Number.isFinite(count)) {
    throw new Error('Notification count response was missing unread_count.')
  }

  return Math.max(0, Math.trunc(count))
}

const getErrorMessage = (data: unknown, fallback: string) =>
  typeof data === 'object' &&
  data !== null &&
  'message' in data &&
  typeof data.message === 'string'
    ? data.message
    : fallback

export const emitNotificationCount = (unreadCount: number) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_COUNT_EVENT, {
      detail: { unreadCount },
    })
  )
}

export const emitNotificationRefresh = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NOTIFICATION_REFRESH_EVENT))
}

export const mapNotification = (item: BackendNotification): Notification => {
  const relatedSwapId = getId(item.related_swap ?? item.relatedSwapId)
  const targetUrl = getString(item, 'target_url', 'targetUrl')

  return {
    id: String(item._id ?? item.id ?? ''),
    userId: getId(item.recipient ?? item.user ?? item.userId),
    type: (typeof item.type === 'string' ? item.type : 'system') as NotificationType,
    title: typeof item.title === 'string' ? item.title : '',
    body: getString(item, 'body', 'message'),
    message: getString(item, 'message', 'body'),
    isRead: Boolean(item.is_read ?? item.isRead),
    actionUrl: targetUrl || (relatedSwapId ? `/user/swaps/${relatedSwapId}` : undefined),
    targetType: getString(item, 'target_type', 'targetType') || undefined,
    targetId: getId(item.target_id ?? item.targetId) || undefined,
    targetUrl: targetUrl || undefined,
    relatedSwapId: relatedSwapId || undefined,
    relatedProductId: getId(item.related_product ?? item.relatedProductId) || undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
  }
}

export const fetchNotificationsWithCount = async () => {
  const [notificationData, unreadCount] = await Promise.all([
    fetch(`${API_URL}/notifications`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    }).then(async (response) => {
      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        throw new Error(getErrorMessage(data, 'Failed to load notifications.'))
      }

      return data
    }),
    fetchUnreadCount(),
  ])

  const items =
    typeof notificationData === 'object' &&
    notificationData !== null &&
    'notifications' in notificationData &&
    Array.isArray(notificationData.notifications)
      ? notificationData.notifications
      : []
  const notifications = items.map((item) => mapNotification(item as BackendNotification))

  return { notifications, unreadCount }
}

export const fetchNotifications = async () => {
  const { notifications } = await fetchNotificationsWithCount()
  return notifications
}

export const fetchUnreadCount = async () => {
  const response = await fetch(`${API_URL}/notifications/unread-count`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Failed to load notification count.'))
  }

  const unreadCount = getUnreadCount(data)
  emitNotificationCount(unreadCount)

  return unreadCount
}

export const markNotificationRead = async (id: string) => {
  const response = await fetch(`${API_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Failed to mark notification read.'))
  }

  const notification =
    typeof data === 'object' &&
    data !== null &&
    'notification' in data &&
    typeof data.notification === 'object' &&
    data.notification !== null
      ? mapNotification(data.notification as BackendNotification)
      : null
  const unreadCount = await fetchUnreadCount()

  return { notification, unreadCount }
}

export const markAllNotificationsRead = async () => {
  const response = await fetch(`${API_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, 'Failed to mark notifications read.'))
  }

  const unreadCount = await fetchUnreadCount()

  return {
    unreadCount,
    modifiedCount:
      typeof data === 'object' &&
      data !== null &&
      Number.isFinite(Number((data as Record<string, unknown>).modified_count))
        ? Number((data as Record<string, unknown>).modified_count)
        : 0,
  }
}
