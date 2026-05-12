'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, XCircle, ShieldCheck, MessageSquare,
  Clock, Truck, Flag, CreditCard, Coins, MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label, Textarea } from '@/components/ui/form-elements'
import { Avatar, AvatarFallback, AvatarImage, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives'
import { SwapStatusBadge, TrustBadge, ConditionBadge } from '@/components/shared/status-badges'
import {
  cancelAdminSwap,
  fetchAdminSwap,
  fetchAdminSwapMessages,
  reviewAdminSwap,
  updateAdminDeliveryTracking,
  type AdminSwapReport,
  type DeliveryTrackingAction,
} from '@/lib/admin-swaps-api'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { DeliveryLifecycleStatus, Message, Product, SwapRequest, SwapStatus, User } from '@/types'

const DELIVERY_STATUS_LABELS: Record<DeliveryLifecycleStatus, string> = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered_to_receiver: 'Delivered to receiver',
  delivery_completed: 'Delivery completed',
}

const formatLabel = (value?: string) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : '-'

const formatTimelineEventName = (event: string) => formatLabel(event)

const ADMIN_CANCELLABLE_SWAP_STATUSES: SwapStatus[] = [
  'pending',
  'in_discussion',
  'under_review',
  'approved',
  'payment_pending',
  'exchange_setup',
  'in_progress',
  'disputed',
]

const getInitials = (user?: User) => {
  if (!user) return 'U'
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` || user.email?.[0]?.toUpperCase() || 'U'
}

export default function AdminSwapDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [swap, setSwap] = useState<SwapRequest | null>(null)
  const [users, setUsers] = useState<Record<string, User>>({})
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [messages, setMessages] = useState<Message[]>([])
  const [reports, setReports] = useState<AdminSwapReport[]>([])
  const [adminNote, setAdminNote] = useState('')
  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [serviceFeeReviewNotice, setServiceFeeReviewNotice] = useState(false)

  useEffect(() => {
    let cancelled = false

    const loadSwap = async () => {
      try {
        const [swapData, swapMessages] = await Promise.all([
          fetchAdminSwap(id),
          fetchAdminSwapMessages(id).catch(() => []),
        ])

        if (cancelled) return

        setSwap(swapData.swap)
        setUsers(swapData.users)
        setProducts(swapData.products)
        setReports(swapData.reports)
        setMessages(swapMessages)
        setAdminNote(swapData.swap.adminNotes || '')
        setServiceFeeReviewNotice(false)
        setLoading(false)
      } catch (error) {
        if (!cancelled) {
          setLoading(false)
          toast.error(error instanceof Error ? error.message : 'Failed to load swap.')
        }
      }
    }

    loadSwap()

    return () => {
      cancelled = true
    }
  }, [id])

  const handleAction = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !adminNote.trim()) {
      toast.error('Please add a rejection reason')
      return
    }

    setProcessing(true)

    try {
      const result = await reviewAdminSwap(id, action, adminNote)
      setSwap(result.swap)
      setUsers(current => ({ ...current, ...result.users }))
      setProducts(current => ({ ...current, ...result.products }))
      window.dispatchEvent(new Event('admin-counts-refresh'))
      toast.success(action === 'approve' ? 'Swap approved!' : 'Swap rejected')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} swap.`)
    } finally {
      setProcessing(false)
    }
  }

  const handleDeliveryTracking = async (action: DeliveryTrackingAction) => {
    setProcessing(true)

    try {
      const result = await updateAdminDeliveryTracking(id, action)
      setSwap(result.swap)
      setUsers(current => ({ ...current, ...result.users }))
      setProducts(current => ({ ...current, ...result.products }))
      toast.success('Delivery tracking updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update delivery tracking.')
    } finally {
      setProcessing(false)
    }
  }

  const handleCancelSwap = async () => {
    const reason = cancelReason.trim()

    if (!reason) {
      toast.error('Please add a cancellation reason')
      return
    }

    setProcessing(true)

    try {
      const result = await cancelAdminSwap(id, reason)
      setSwap(result.swap)
      setUsers(current => ({ ...current, ...result.users }))
      setProducts(current => ({ ...current, ...result.products }))
      setAdminNote(result.swap.adminNotes || reason)
      setServiceFeeReviewNotice(result.serviceFeeReviewRequired)
      setShowCancelModal(false)
      setCancelReason('')
      window.dispatchEvent(new Event('admin-counts-refresh'))

      if (result.serviceFeeReviewRequired) {
        toast.warning('Swap cancelled. Service fee review may be required; no automatic refund was issued.')
      } else {
        toast.success('Swap cancelled')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel swap.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Loading swap...</p>
      </div>
    )
  }

  if (!swap) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Swap not found</p>
        <Button asChild variant="outline" className="mt-4"><Link href="/admin/swaps">Back</Link></Button>
      </div>
    )
  }

  const requester = users[swap.requesterId]
  const receiver = users[swap.receiverId]
  const reviewer = swap.adminReviewedBy ? users[swap.adminReviewedBy] : null
  const offered = products[swap.offeredProductId]
  const requested = products[swap.requestedProductId]
  const visibleMessages = messages.filter(message => message.type !== 'system')
  const isDeliverySwap = swap.exchangeMethod === 'delivery'
  const canReview = swap.status === 'under_review'
  const canCancelSwap = ADMIN_CANCELLABLE_SWAP_STATUSES.includes(swap.status)
  const canTrackDelivery = isDeliverySwap && swap.status === 'in_progress'
  const deliveryStatus = swap.deliveryDetails?.deliveryStatus ?? 'pending_pickup'
  const deliveryTracking = swap.deliveryDetails?.tracking ?? {
    requesterItemPickedUp: false,
    receiverItemPickedUp: false,
    deliveredToRequester: false,
    deliveredToReceiver: false,
  }
  const openReports = reports.filter(report => report.status === 'open' || report.status === 'under_review')

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon"><Link href="/admin/swaps"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">Swap {swap.id}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <SwapStatusBadge status={swap.status} />
            <span className="text-xs text-muted-foreground">Created {format(new Date(swap.createdAt), 'MMM d, yyyy')}</span>
            <span className="text-xs text-muted-foreground">Updated {format(new Date(swap.updatedAt), 'MMM d, yyyy')}</span>
          </div>
        </div>
        {canReview && (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" onClick={() => handleAction('reject')} loading={processing}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" size="sm" onClick={() => handleAction('approve')} loading={processing}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        )}
        {swap.status === 'disputed' && (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/reports"><Flag className="h-3.5 w-3.5" /> Resolve dispute</Link>
          </Button>
        )}
        {canCancelSwap && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => {
              setCancelReason(adminNote || '')
              setShowCancelModal(true)
            }}
            disabled={processing}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Cancel swap
          </Button>
        )}
      </div>

      {serviceFeeReviewNotice && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>Service fee review may be required. No automatic refund was issued.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {[{ label: 'Requester', user: requester, product: offered }, { label: 'Receiver', user: receiver, product: requested }].map(({ label, user, product }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{label}</p>
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-xs bg-brand-100 text-brand-700">{getInitials(user)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium truncate">{user ? `${user.firstName} ${user.lastName}` : 'Deleted user'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email || 'No email available'}</p>
                <div className="flex items-center gap-1.5 mt-0.5"><TrustBadge level={user?.trustLevel || 'new'} /><span className="text-xs text-muted-foreground">{user?.completedSwaps || 0} swaps</span></div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                {product?.images[0] && <img src={product.images[0]} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{product?.title || 'Unavailable product'}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <ConditionBadge condition={product?.condition || 'good'} />
                  <span className="text-xs font-bold text-primary">~{(product?.estimatedValue || 0).toLocaleString()} EGP</span>
                  <Badge variant="outline">{formatLabel(product?.status)}</Badge>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><h3 className="font-semibold">Service fees</h3></div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Requester</span><Badge variant={swap.requesterPaid ? 'approved' : 'outline'}>{swap.requesterPaid ? 'Paid' : 'Unpaid'}</Badge></div>
            <div className="flex items-center justify-between"><span>Receiver</span><Badge variant={swap.receiverPaid ? 'approved' : 'outline'}>{swap.receiverPaid ? 'Paid' : 'Unpaid'}</Badge></div>
            <p className="text-xs text-muted-foreground">{swap.serviceFeeRequester} EGP / {swap.serviceFeeReceiver} EGP</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /><h3 className="font-semibold">Compensation</h3></div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Status</span><Badge variant={swap.compensationStatus === 'held' ? 'warning' : 'outline'}>{formatLabel(swap.compensationStatus || 'none')}</Badge></div>
            <div className="flex items-center justify-between"><span>Amount</span><span className="font-medium">{(swap.compensationAmount || 0).toLocaleString()} coins</span></div>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><h3 className="font-semibold">Exchange</h3></div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Method</span><Badge variant="outline">{formatLabel(swap.exchangeMethod)}</Badge></div>
            <div className="flex items-center justify-between"><span>Proposal</span><span className="text-muted-foreground">{formatLabel(swap.exchangeProposalStatus)}</span></div>
            {swap.exchangeMethod === 'meetup' && swap.meetupDetails && (
              <p className="text-xs text-muted-foreground">{[swap.meetupDetails.city, swap.meetupDetails.area, swap.meetupDetails.meetingPoint].filter(Boolean).join(', ')}</p>
            )}
            {isDeliverySwap && (
              <p className="text-xs text-muted-foreground">{DELIVERY_STATUS_LABELS[deliveryStatus]}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="font-semibold">Admin review</h3></div>
          {swap.adminReviewedAt && <span className="text-xs text-muted-foreground">Reviewed {format(new Date(swap.adminReviewedAt), 'MMM d, yyyy h:mm a')}</span>}
        </div>
        {reviewer && <p className="text-xs text-muted-foreground">Reviewed by {reviewer.firstName} {reviewer.lastName}</p>}
        {canReview ? (
          <Textarea value={adminNote} onChange={event => setAdminNote(event.target.value)} placeholder="Add notes about this swap review..." rows={3} />
        ) : (
          <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{swap.adminNotes || 'No admin notes recorded.'}</p>
        )}
      </div>

      {isDeliverySwap && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /><h3 className="font-semibold">Delivery tracking</h3></div>
            <Badge variant={deliveryStatus === 'delivery_completed' ? 'success' : 'info'}>
              {DELIVERY_STATUS_LABELS[deliveryStatus]}
            </Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              {
                label: 'Mark requester item picked up',
                done: deliveryTracking.requesterItemPickedUp,
                action: 'mark_requester_picked_up' as DeliveryTrackingAction,
                status: `${requester?.firstName || 'Requester'} pickup`,
              },
              {
                label: 'Mark receiver item picked up',
                done: deliveryTracking.receiverItemPickedUp,
                action: 'mark_receiver_picked_up' as DeliveryTrackingAction,
                status: `${receiver?.firstName || 'Receiver'} pickup`,
              },
              {
                label: 'Mark delivered to requester',
                done: deliveryTracking.deliveredToRequester,
                action: 'mark_delivered_to_requester' as DeliveryTrackingAction,
                status: `Delivered to ${requester?.firstName || 'requester'}`,
              },
              {
                label: 'Mark delivered to receiver',
                done: deliveryTracking.deliveredToReceiver,
                action: 'mark_delivered_to_receiver' as DeliveryTrackingAction,
                status: `Delivered to ${receiver?.firstName || 'receiver'}`,
              },
            ].map(item => (
              <div key={item.action} className="rounded-xl border border-border p-3 bg-muted/30">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="font-medium">{item.status}</p>
                  {item.done && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                </div>
                {canTrackDelivery ? (
                  <Button
                    size="sm"
                    variant={item.done ? 'outline' : 'default'}
                    disabled={processing || item.done}
                    onClick={() => handleDeliveryTracking(item.action)}
                    className="w-full"
                  >
                    {item.done ? 'Completed' : item.label}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">{item.done ? 'Completed' : 'Pending'}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2"><Flag className="h-4 w-4 text-primary" /><h3 className="font-semibold">Reports and disputes</h3></div>
          {openReports.length > 0 && (
            <Button asChild size="sm" variant="outline"><Link href="/admin/reports">Resolve reports</Link></Button>
          )}
        </div>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports or disputes linked to this swap.</p>
        ) : (
          <div className="space-y-3">
            {reports.map(report => (
              <div key={report.id} className="rounded-xl border border-border p-3 bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{report.reason}</p>
                  <Badge variant={report.status === 'resolved' || report.status === 'dismissed' ? 'outline' : 'warning'}>{formatLabel(report.status)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{report.description || 'No description provided.'}</p>
                <p className="text-xs text-muted-foreground mt-1">Reported by {report.reporter?.email || 'unknown'} on {format(new Date(report.createdAt), 'MMM d, yyyy')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4"><MessageSquare className="h-4 w-4 text-primary" /><h3 className="font-semibold">Discussion ({visibleMessages.length} messages)</h3></div>
        {visibleMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No user messages in this discussion.</p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {visibleMessages.map(message => {
              const sender = users[message.senderId]
              return (
                <div key={message.id} className="flex items-start gap-2.5">
                  <Avatar className="h-6 w-6 shrink-0"><AvatarImage src={sender?.avatar} /><AvatarFallback className="text-[9px]">{getInitials(sender)}</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold">{sender?.firstName || 'User'}</p>
                      <p className="text-[10px] text-muted-foreground">{format(new Date(message.createdAt), 'MMM d, h:mm a')}</p>
                      {message.isReported && <Badge variant="rejected" className="text-[10px] px-1.5 py-0">Reported</Badge>}
                    </div>
                    <p className="text-sm mt-0.5 bg-muted rounded-lg px-3 py-2 inline-block">{message.content}</p>
                    {message.reportReason && <p className="text-[10px] text-destructive mt-1">Reason: {message.reportReason}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4"><Clock className="h-4 w-4 text-primary" /><h3 className="font-semibold">Timeline</h3></div>
        <div className="space-y-3">
          {swap.timeline.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No timeline events yet.
            </div>
          )}
          {swap.timeline.map((event, index) => (
            <div key={event.id || `${event.event}-${event.createdAt}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                {index < swap.timeline.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className="pb-3">
                <p className="text-sm font-medium">{formatTimelineEventName(event.event)}</p>
                <p className="text-xs text-muted-foreground">{event.description}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(event.createdAt), 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this swap?</DialogTitle>
            <DialogDescription>
              This will cancel the active swap and release reserved products if no other active swap still needs them. Completed service-fee payments are not automatically refunded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              If either participant already paid a service fee, manual refund or review may be required after cancellation.
            </div>
            <div className="space-y-1.5">
              <Label>Cancellation reason *</Label>
              <Textarea
                value={cancelReason}
                onChange={event => setCancelReason(event.target.value)}
                placeholder="Explain why this swap is being cancelled..."
                rows={4}
                maxLength={1000}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCancelModal(false)}
                disabled={processing}
              >
                Keep swap
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancelSwap}
                loading={processing}
                disabled={processing || !cancelReason.trim()}
              >
                Cancel swap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
