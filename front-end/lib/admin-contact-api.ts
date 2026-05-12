import { API_BASE_URL as API_URL } from '@/lib/api-config'

type BackendRecord = Record<string, unknown>

export const CONTACT_INQUIRY_TYPES = [
  'general',
  'report',
  'dispute',
  'billing',
  'technical',
] as const

export const CONTACT_MESSAGE_STATUSES = [
  'open',
  'in_review',
  'resolved',
  'dismissed',
] as const

export type ContactInquiryType = typeof CONTACT_INQUIRY_TYPES[number]
export type ContactMessageStatus = typeof CONTACT_MESSAGE_STATUSES[number]

export interface AdminContactUser {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  avatar: string
  role: string
}

export interface AdminContactMessage {
  id: string
  fullName: string
  email: string
  inquiryType: ContactInquiryType
  subject: string
  message: string
  status: ContactMessageStatus
  adminNotes: string
  userReply: string
  repliedAt?: string
  repliedBy: AdminContactUser | null
  resolvedAt?: string
  resolvedBy: AdminContactUser | null
  user: AdminContactUser | null
  createdAt: string
  updatedAt: string
}

export interface AdminContactFilters {
  status?: ContactMessageStatus | ''
  inquiryType?: ContactInquiryType | ''
}

export interface UpdateContactMessagePayload {
  status?: ContactMessageStatus
  adminNotes?: string
  userReply?: string
}

export interface ContactReplyDelivery {
  notificationSent: boolean
  emailSent: boolean
  emailSkipped: boolean
}

export interface UpdateContactMessageResult {
  contactMessage: AdminContactMessage
  replyDelivery?: ContactReplyDelivery
  warnings: string[]
}

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
})

const getString = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }

  return ''
}

const getBoolean = (item: BackendRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'boolean') return value
  }

  return false
}

const isInquiryType = (value: unknown): value is ContactInquiryType =>
  typeof value === 'string' && CONTACT_INQUIRY_TYPES.includes(value as ContactInquiryType)

const isMessageStatus = (value: unknown): value is ContactMessageStatus =>
  typeof value === 'string' && CONTACT_MESSAGE_STATUSES.includes(value as ContactMessageStatus)

const mapUser = (value: unknown): AdminContactUser | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const item = value as BackendRecord
  const firstName = getString(item, 'first_name', 'firstName')
  const lastName = getString(item, 'last_name', 'lastName')
  const name = getString(item, 'name') || `${firstName} ${lastName}`.trim()

  return {
    id: String(item._id ?? item.id ?? ''),
    firstName,
    lastName,
    name,
    email: getString(item, 'email'),
    avatar: getString(item, 'avatar'),
    role: getString(item, 'role'),
  }
}

const mapContactMessage = (value: unknown): AdminContactMessage => {
  const item = typeof value === 'object' && value !== null ? value as BackendRecord : {}
  const rawInquiryType = item.inquiry_type ?? item.inquiryType
  const rawStatus = item.status

  return {
    id: String(item._id ?? item.id ?? ''),
    fullName: getString(item, 'full_name', 'fullName'),
    email: getString(item, 'email'),
    inquiryType: isInquiryType(rawInquiryType) ? rawInquiryType : 'general',
    subject: getString(item, 'subject'),
    message: getString(item, 'message'),
    status: isMessageStatus(rawStatus) ? rawStatus : 'open',
    adminNotes: getString(item, 'admin_notes', 'adminNotes'),
    userReply: getString(item, 'user_reply', 'userReply'),
    repliedAt: getString(item, 'replied_at', 'repliedAt') || undefined,
    repliedBy: mapUser(item.replied_by ?? item.repliedBy),
    resolvedAt: getString(item, 'resolved_at', 'resolvedAt') || undefined,
    resolvedBy: mapUser(item.resolved_by ?? item.resolvedBy),
    user: mapUser(item.user_id ?? item.userId ?? item.user),
    createdAt: getString(item, 'createdAt', 'created_at') || new Date().toISOString(),
    updatedAt: getString(item, 'updatedAt', 'updated_at') || new Date().toISOString(),
  }
}

const mapReplyDelivery = (value: unknown): ContactReplyDelivery | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const item = value as BackendRecord

  return {
    notificationSent: getBoolean(item, 'notification_sent', 'notificationSent'),
    emailSent: getBoolean(item, 'email_sent', 'emailSent'),
    emailSkipped: getBoolean(item, 'email_skipped', 'emailSkipped'),
  }
}

const parseJson = async (response: Response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const assertOk = async (response: Response, fallback: string) => {
  const data = await parseJson(response)

  if (!response.ok) {
    throw new Error(
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : fallback
    )
  }

  return data as BackendRecord
}

const buildQueryString = (filters: AdminContactFilters) => {
  const params = new URLSearchParams()

  if (filters.status) {
    params.set('status', filters.status)
  }

  if (filters.inquiryType) {
    params.set('inquiry_type', filters.inquiryType)
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}

export const fetchAdminContactMessages = async (
  filters: AdminContactFilters = {}
): Promise<AdminContactMessage[]> => {
  const response = await fetch(`${API_URL}/admin/contact-messages${buildQueryString(filters)}`, {
    headers: getAuthHeaders(),
  })
  const data = await assertOk(response, 'Failed to load support messages.')
  const rawMessages = Array.isArray(data.messages) ? data.messages : []

  return rawMessages.map(mapContactMessage)
}

export const updateAdminContactMessage = async (
  id: string,
  payload: UpdateContactMessagePayload
): Promise<UpdateContactMessageResult> => {
  const body: Record<string, string> = {}

  if (payload.status) {
    body.status = payload.status
  }

  if (payload.adminNotes !== undefined) {
    body.admin_notes = payload.adminNotes
  }

  if (payload.userReply !== undefined) {
    body.user_reply = payload.userReply
  }

  const response = await fetch(`${API_URL}/admin/contact-messages/${id}/status`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await assertOk(response, 'Failed to update support message.')

  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((item): item is string => typeof item === 'string')
    : []

  return {
    contactMessage: mapContactMessage(data.contact_message),
    replyDelivery: mapReplyDelivery(data.reply_delivery ?? data.replyDelivery),
    warnings,
  }
}
