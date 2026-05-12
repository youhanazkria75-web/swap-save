'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Inbox, RotateCcw, Search, XCircle, Eye, Send } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/form-elements'
import { AdminFilterDropdown } from '@/components/admin/admin-filter-dropdown'
import { cn } from '@/lib/utils'
import {
  CONTACT_INQUIRY_TYPES,
  CONTACT_MESSAGE_STATUSES,
  fetchAdminContactMessages,
  updateAdminContactMessage,
  type AdminContactMessage,
  type ContactInquiryType,
  type ContactMessageStatus,
  type UpdateContactMessageResult,
} from '@/lib/admin-contact-api'

type FilterState = {
  status: ContactMessageStatus | ''
  inquiryType: ContactInquiryType | ''
}

const emptyFilters: FilterState = {
  status: '',
  inquiryType: '',
}

const statusStyles: Record<ContactMessageStatus, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_review: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved: 'bg-green-50 text-green-700 border-green-200',
  dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
}

const formatLabel = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())

const formatDate = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '-' : format(parsed, 'MMM d, yyyy h:mm a')
}

export default function AdminSupportPage() {
  const [messages, setMessages] = useState<AdminContactMessage[]>([])
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [search, setSearch] = useState('')
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const loadMessages = useCallback(async () => {
    setLoading(true)

    try {
      const items = await fetchAdminContactMessages(filters)
      setMessages(items)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load support messages.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) {
      return messages
    }

    return messages.filter(message => {
      const haystack = [
        message.fullName,
        message.email,
        message.subject,
        message.message,
        message.userReply,
        message.user?.name || '',
        message.user?.email || '',
      ].join(' ').toLowerCase()

      return haystack.includes(q)
    })
  }, [messages, search])

  const summary = useMemo(() => ({
    open: messages.filter(message => message.status === 'open').length,
    inReview: messages.filter(message => message.status === 'in_review').length,
    resolved: messages.filter(message => message.status === 'resolved').length,
    dismissed: messages.filter(message => message.status === 'dismissed').length,
  }), [messages])

  const setFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(current => ({
      ...current,
      [key]: value,
    }))
  }

  const resetFilters = () => {
    setFilters(emptyFilters)
    setSearch('')
  }

  const getDraftNote = (message: AdminContactMessage) =>
    draftNotes[message.id] ?? message.adminNotes

  const getDraftReply = (message: AdminContactMessage) =>
    draftReplies[message.id] ?? ''

  const applyUpdatedMessage = (updated: AdminContactMessage) => {
    setMessages(current => current.map(item => item.id === updated.id ? updated : item))
    setDraftNotes(current => ({ ...current, [updated.id]: updated.adminNotes }))
  }

  const clearDraftReply = (messageId: string) => {
    setDraftReplies(current => {
      const next = { ...current }
      delete next[messageId]
      return next
    })
  }

  const showReplyResultToast = (result: UpdateContactMessageResult) => {
    const delivery = result.replyDelivery

    if (result.warnings.length > 0 || (delivery && !delivery.emailSent && !delivery.emailSkipped)) {
      toast.warning('Reply saved, but email delivery may have failed.')
      return
    }

    if (delivery?.emailSkipped) {
      toast.warning('Reply saved, but email delivery was skipped because SMTP is not configured.')
      return
    }

    toast.success('Reply sent to user')
  }

  const handleSaveNotes = async (message: AdminContactMessage) => {
    setProcessingId(message.id)

    try {
      const result = await updateAdminContactMessage(message.id, {
        adminNotes: getDraftNote(message),
      })
      applyUpdatedMessage(result.contactMessage)
      window.dispatchEvent(new Event('admin-counts-refresh'))
      toast.success('Admin notes saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update support message.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleSendReply = async (message: AdminContactMessage) => {
    const reply = getDraftReply(message).trim()

    if (!reply) {
      toast.error('Write a reply before sending.')
      return
    }

    setProcessingId(message.id)

    try {
      const result = await updateAdminContactMessage(message.id, {
        userReply: reply,
      })
      applyUpdatedMessage(result.contactMessage)
      clearDraftReply(result.contactMessage.id)
      showReplyResultToast(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send reply.')
    } finally {
      setProcessingId(null)
    }
  }

  const handleStatusUpdate = async (
    message: AdminContactMessage,
    status: ContactMessageStatus
  ) => {
    const reply = getDraftReply(message).trim()

    if (status === 'resolved' && !reply) {
      const confirmed = window.confirm('Resolve without sending a reply?')

      if (!confirmed) return
    }

    setProcessingId(message.id)

    try {
      const result = await updateAdminContactMessage(message.id, {
        status,
        adminNotes: getDraftNote(message),
        ...(reply ? { userReply: reply } : {}),
      })
      applyUpdatedMessage(result.contactMessage)

      if (reply) {
        clearDraftReply(result.contactMessage.id)
        showReplyResultToast(result)
      } else {
        toast.success(`Message marked ${formatLabel(status).toLowerCase()}`)
      }

      window.dispatchEvent(new Event('admin-counts-refresh'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update support message.')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Support Inbox</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {summary.open} open message{summary.open === 1 ? '' : 's'} and {summary.inReview} in review
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open', count: summary.open, color: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'In Review', count: summary.inReview, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Resolved', count: summary.resolved, color: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Dismissed', count: summary.dismissed, color: 'bg-gray-100 text-gray-600 border-gray-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.color}`}>
            <p className="text-xl font-bold">{item.count}</p>
            <p className="text-xs font-medium opacity-80">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search messages, names, or email"
              className="pl-10"
            />
          </div>
          <AdminFilterDropdown
            value={filters.status}
            onChange={value => setFilter('status', value as FilterState['status'])}
            ariaLabel="Filter by status"
            className="w-full"
            options={[
              { value: '', label: 'All statuses' },
              ...CONTACT_MESSAGE_STATUSES.map(status => ({ value: status, label: formatLabel(status) })),
            ]}
          />
          <AdminFilterDropdown
            value={filters.inquiryType}
            onChange={value => setFilter('inquiryType', value as FilterState['inquiryType'])}
            ariaLabel="Filter by inquiry type"
            className="w-full"
            options={[
              { value: '', label: 'All types' },
              ...CONTACT_INQUIRY_TYPES.map(type => ({ value: type, label: formatLabel(type) })),
            ]}
          />
          <Button variant="outline" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredMessages.map(message => {
          const note = getDraftNote(message)
          const reply = getDraftReply(message)
          const isProcessing = processingId === message.id

          return (
            <div key={message.id} className={cn('bg-card rounded-2xl border border-border p-5', message.status !== 'open' && 'opacity-90')}>
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{formatLabel(message.inquiryType)}</Badge>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', statusStyles[message.status])}>
                      {formatLabel(message.status)}
                    </span>
                    {message.user && (
                      <Badge variant="info">Linked user</Badge>
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold truncate">{message.subject}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      From <span className="text-foreground font-medium">{message.fullName}</span> at {message.email}
                    </p>
                    {message.user && (
                      <p className="text-xs text-muted-foreground">
                        Account: <span className="text-foreground font-medium">{message.user.name || message.user.email}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDate(message.createdAt)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isProcessing || message.status === 'open'}
                    onClick={() => handleStatusUpdate(message, 'open')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isProcessing || message.status === 'in_review'}
                    onClick={() => handleStatusUpdate(message, 'in_review')}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    In review
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    disabled={isProcessing || message.status === 'resolved'}
                    onClick={() => handleStatusUpdate(message, 'resolved')}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={isProcessing || message.status === 'dismissed'}
                    onClick={() => handleStatusUpdate(message, 'dismissed')}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Dismiss
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Message</p>
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  </div>
                  {message.userReply && (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-green-800">Last reply to user</p>
                        {message.repliedAt && (
                          <p className="text-xs text-green-700">
                            {formatDate(message.repliedAt)}
                            {message.repliedBy?.name ? ` by ${message.repliedBy.name}` : ''}
                          </p>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-green-950">{message.userReply}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Admin notes</p>
                      <p className="text-xs text-muted-foreground">Internal only. Never sent to the user.</p>
                    </div>
                    <Textarea
                      value={note}
                      onChange={event => setDraftNotes(current => ({ ...current, [message.id]: event.target.value }))}
                      placeholder="Add internal review notes"
                      rows={5}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isProcessing || note === message.adminNotes}
                      onClick={() => handleSaveNotes(message)}
                    >
                      Save notes
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                    <div>
                      <p className="text-xs font-medium text-blue-800">Reply to user</p>
                      <p className="text-xs text-blue-700">Sent to the user by email and notification when available.</p>
                    </div>
                    <Textarea
                      value={reply}
                      onChange={event => setDraftReplies(current => ({ ...current, [message.id]: event.target.value }))}
                      placeholder="Write a user-facing support reply"
                      rows={5}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      loading={isProcessing}
                      disabled={isProcessing || !reply.trim()}
                      onClick={() => handleSendReply(message)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send reply to user
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!loading && filteredMessages.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p>No support messages found</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p>Loading support messages...</p>
        </div>
      )}
    </div>
  )
}
