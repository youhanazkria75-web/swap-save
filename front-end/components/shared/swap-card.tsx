'use client'

import Link from 'next/link'
import { ArrowLeftRight, ChevronRight, Clock, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SwapStatusBadge } from '@/components/shared/status-badges'
import { formatDistanceToNow } from 'date-fns'
import type { Product, SwapRequest, User } from '@/types'

const DELIVERY_STATUS_LABELS = {
  pending_pickup: 'Pending pickup',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered_to_receiver: 'Delivered',
  delivery_completed: 'Delivery completed',
} as const

const DELIVERY_METADATA_SWAP_STATUSES = new Set(['exchange_setup', 'in_progress'])

interface SwapCardProps {
  swap: SwapRequest
  currentUserId: string
  requester?: User
  receiver?: User
  offeredProduct?: Product
  requestedProduct?: Product
  showAdminActions?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}

export function SwapCard({
  swap,
  currentUserId,
  requester: requesterProp,
  receiver: receiverProp,
  offeredProduct: offeredProductProp,
  requestedProduct: requestedProductProp,
  showAdminActions,
  onApprove,
  onReject,
}: SwapCardProps) {
  const isRequester = swap.requesterId === currentUserId
  const canRespond = swap.receiverId === currentUserId && swap.status === 'pending' && Boolean(onApprove && onReject)
  const requester = requesterProp
  const receiver = receiverProp
  const offeredProduct = offeredProductProp
  const requestedProduct = requestedProductProp

  const other = isRequester ? receiver : requester
  const otherName = other ? `${other.firstName} ${other.lastName}`.trim() : 'Unknown user'
  const offeredProductTitle = offeredProduct?.title ?? 'Unknown product'
  const requestedProductTitle = requestedProduct?.title ?? 'Unknown product'
  const deliveryStatus = swap.deliveryDetails?.deliveryStatus
  const shouldShowDeliveryStatus =
    Boolean(deliveryStatus) &&
    DELIVERY_METADATA_SWAP_STATUSES.has(swap.status) &&
    (swap.exchangeMethod === 'delivery' || (swap.exchangeMethod !== 'meetup' && Boolean(swap.deliveryDetails)))

  return (
    <div className="p-4 bg-card rounded-xl border border-border hover:shadow-card-hover transition-all">
      <Link
        href={`/user/swaps/${swap.id}`}
        className="flex items-center gap-4 group"
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted">
            {offeredProduct?.images[0] && (
              <img src={offeredProduct.images[0]} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted">
            {requestedProduct?.images[0] && (
              <img src={requestedProduct.images[0]} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-sm font-medium truncate">
              {offeredProductTitle} -&gt; {requestedProductTitle}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{isRequester ? 'You -&gt; ' : ''}{otherName}</span>
            <span aria-hidden="true">&bull;</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(swap.updatedAt), { addSuffix: true })}
            </span>
            {shouldShowDeliveryStatus && deliveryStatus && (
              <>
                <span aria-hidden="true">&bull;</span>
                <span className="flex items-center gap-1 text-blue-700">
                  <Truck className="h-3 w-3" />
                  {DELIVERY_STATUS_LABELS[deliveryStatus]}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <SwapStatusBadge status={swap.status} />
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </Link>

      {canRespond && (
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={() => onReject?.(swap.id)}>
            Reject
          </Button>
          <Button size="sm" onClick={() => onApprove?.(swap.id)}>
            Accept
          </Button>
        </div>
      )}
    </div>
  )
}
