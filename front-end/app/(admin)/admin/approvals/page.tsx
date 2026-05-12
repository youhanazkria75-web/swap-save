'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Clock, CheckCircle2, XCircle,
  DollarSign, MessageSquare, ChevronDown, ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/form-elements'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/primitives'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { TrustBadge, ConditionBadge } from '@/components/shared/status-badges'
import { fetchAdminSwapMessages, fetchAdminSwaps, reviewAdminSwap } from '@/lib/admin-swaps-api'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { Message, Product, SwapRequest, User } from '@/types'

const getInitials = (user?: User) => {
  if (!user) return 'U'
  return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` || user.email?.[0]?.toUpperCase() || 'U'
}

export default function PendingApprovalsPage() {
  const [pending, setPending] = useState<SwapRequest[]>([])
  const [users, setUsers] = useState<Record<string, User>>({})
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [messagesBySwap, setMessagesBySwap] = useState<Record<string, Message[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionModal, setActionModal] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [processing, setProcessing] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadPendingApprovals = useCallback(async (cancelledRef?: { current: boolean }) => {
    setLoading(true)

    try {
      const data = await fetchAdminSwaps('under_review')
      if (cancelledRef?.current) return

      const sorted = [...data.swaps].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setPending(sorted)
      setUsers(data.users)
      setProducts(data.products)
      setLoading(false)

      const messageEntries = await Promise.all(
        sorted.map(async (swap) => {
          try {
            const swapMessages = await fetchAdminSwapMessages(swap.id)
            return [swap.id, swapMessages] as const
          } catch {
            return [swap.id, []] as const
          }
        })
      )

      if (!cancelledRef?.current) {
        setMessagesBySwap(Object.fromEntries(messageEntries))
      }
    } catch (error) {
      if (!cancelledRef?.current) {
        setLoading(false)
        toast.error(error instanceof Error ? error.message : 'Failed to load pending approvals.')
      }
    }
  }, [])

  useEffect(() => {
    const cancelledRef = { current: false }
    loadPendingApprovals(cancelledRef)

    return () => {
      cancelledRef.current = true
    }
  }, [loadPendingApprovals])

  const handleAction = async () => {
    if (!actionModal) return
    setProcessing(true)
    const isApprove = actionModal.type === 'approve'

    try {
      const result = await reviewAdminSwap(actionModal.id, actionModal.type, adminNote)

      setPending(current => current.filter(swap => swap.id !== actionModal.id))
      setUsers(current => ({ ...current, ...result.users }))
      setProducts(current => ({ ...current, ...result.products }))
      setProcessing(false)
      setActionModal(null)
      setAdminNote('')
      window.dispatchEvent(new Event('admin-counts-refresh'))
      toast.success(isApprove ? 'Swap approved!' : 'Swap rejected', {
        description: isApprove ? 'Both users have been notified.' : 'Users have been notified.',
      })
    } catch (error) {
      setProcessing(false)
      toast.error(error instanceof Error ? error.message : `Failed to ${actionModal.type} swap.`)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">Swap Approvals</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-2xl border border-border">
          <Clock className="h-16 w-16 text-amber-500/40 mb-4" />
          <p className="text-xl font-semibold">Loading approvals...</p>
        </div>
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">Swap Approvals</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-2xl border border-border">
          <CheckCircle2 className="h-16 w-16 text-green-500/40 mb-4" />
          <p className="text-xl font-semibold">No pending approvals</p>
          <p className="text-muted-foreground mt-1">No swaps are waiting for review.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Swap Approvals</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{pending.length} under-review swap{pending.length !== 1 ? 's' : ''}</p>
        </div>
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-sm px-3 py-1">
          <Clock className="h-3.5 w-3.5 mr-1.5" /> {pending.length} pending
        </Badge>
      </div>

      <div className="space-y-4">
        {pending.map(swap => {
          const requester = users[swap.requesterId]
          const receiver = users[swap.receiverId]
          const offered = products[swap.offeredProductId]
          const requested = products[swap.requestedProductId]
          const swapMessages = (messagesBySwap[swap.id] || []).filter(message => message.type !== 'system')
          const isExpanded = expandedId === swap.id
          const valueDiff = Math.abs((offered?.estimatedValue || 0) - (requested?.estimatedValue || 0))
          const valueDiffPct = offered?.estimatedValue
            ? Math.round((valueDiff / offered.estimatedValue) * 100)
            : 0

          return (
            <div key={swap.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="warning" className="gap-1">
                      <Clock className="h-3 w-3" /> Under Review
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Submitted {formatDistanceToNow(new Date(swap.updatedAt), { addSuffix: true })}
                    </span>
                    <span className="text-xs text-muted-foreground">ID: {swap.id}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setActionModal({ id: swap.id, type: 'reject' })}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setActionModal({ id: swap.id, type: 'approve' })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </Button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  {[
                    { label: 'Requester', user: requester, product: offered },
                    { label: 'Receiver', user: receiver, product: requested },
                  ].map(({ label, user, product }) => (
                    <div key={label} className="bg-muted/40 rounded-xl p-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{label}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={user?.avatar} />
                          <AvatarFallback className="text-xs bg-brand-100 text-brand-700">
                            {getInitials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{user?.firstName} {user?.lastName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <TrustBadge level={user?.trustLevel || 'new'} />
                            <span className="text-xs text-muted-foreground">{user?.completedSwaps || 0} swaps</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-card rounded-lg p-2.5 border border-border">
                        <div className="h-10 w-10 rounded-md overflow-hidden bg-muted shrink-0">
                          {product?.images[0] && <img src={product.images[0]} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{product?.title || 'Unavailable product'}</p>
                          <div className="flex items-center gap-1.5">
                            <ConditionBadge condition={product?.condition || 'good'} />
                            <span className="text-xs font-bold text-primary">~{(product?.estimatedValue || 0).toLocaleString()} EGP</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={cn(
                  'flex items-center gap-3 p-3 rounded-xl mb-4 text-sm',
                  valueDiffPct > 30
                    ? 'bg-red-50 border border-red-200'
                    : valueDiffPct > 15
                    ? 'bg-amber-50 border border-amber-200'
                    : 'bg-green-50 border border-green-200'
                )}>
                  <DollarSign className={cn('h-4 w-4 shrink-0', valueDiffPct > 30 ? 'text-red-600' : valueDiffPct > 15 ? 'text-amber-600' : 'text-green-600')} />
                  <div className="flex-1">
                    <span className="font-medium">Value comparison: </span>
                    <span>~{(offered?.estimatedValue || 0).toLocaleString()} EGP vs ~{(requested?.estimatedValue || 0).toLocaleString()} EGP</span>
                    <span className={cn('ml-2 font-semibold', valueDiffPct > 30 ? 'text-red-700' : valueDiffPct > 15 ? 'text-amber-700' : 'text-green-700')}>
                      ({valueDiffPct}% difference - {valueDiffPct > 30 ? 'Large gap - review carefully' : valueDiffPct > 15 ? 'Moderate gap' : 'Acceptable gap'})
                    </span>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-xl p-3 mb-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Initial message from {requester?.firstName || 'requester'}</p>
                  <p className="text-sm italic">"{swap.message}"</p>
                </div>

                {swapMessages.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4" />
                    <span>{swapMessages.length} message{swapMessages.length !== 1 ? 's' : ''} in discussion</span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : swap.id)}
                      className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {isExpanded ? 'Hide' : 'Review messages'}
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && swapMessages.length > 0 && (
                <div className="border-t border-border bg-muted/30 p-5 animate-fade-in">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Discussion transcript</p>
                    <Badge variant="info" className="text-xs ml-auto">Admin view</Badge>
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {swapMessages.map(message => {
                      const sender = users[message.senderId]
                      return (
                        <div key={message.id} className="flex items-start gap-2.5">
                          <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                            <AvatarImage src={sender?.avatar} />
                            <AvatarFallback className="text-[9px] bg-muted">{getInitials(sender)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold">{sender?.firstName || 'User'}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                              </p>
                            </div>
                            <p className="text-sm mt-0.5 bg-card rounded-lg px-3 py-2 border border-border inline-block">{message.content}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Dialog open={!!actionModal} onOpenChange={() => { setActionModal(null); setAdminNote('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={actionModal?.type === 'approve' ? 'text-green-700' : 'text-destructive'}>
              {actionModal?.type === 'approve' ? 'Approve this swap?' : 'Reject this swap?'}
            </DialogTitle>
            <DialogDescription>
              {actionModal?.type === 'approve'
                ? 'Both users will be notified and can proceed to the service fee step.'
                : 'Both users will be notified with your reason for rejection.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Admin note {actionModal?.type === 'reject' ? '(required for rejection)' : '(optional)'}
              </label>
              <Textarea
                value={adminNote}
                onChange={event => setAdminNote(event.target.value)}
                placeholder={actionModal?.type === 'approve'
                  ? 'Optional note for the users...'
                  : 'Explain why this swap is being rejected...'}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setActionModal(null); setAdminNote('') }}>
                Cancel
              </Button>
              <Button
                className={cn('flex-1', actionModal?.type === 'approve' ? 'bg-green-600 hover:bg-green-700 text-white' : '')}
                variant={actionModal?.type === 'reject' ? 'destructive' : 'default'}
                onClick={handleAction}
                loading={processing}
                disabled={actionModal?.type === 'reject' && !adminNote.trim()}
              >
                {actionModal?.type === 'approve' ? 'Approve swap' : 'Reject swap'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
