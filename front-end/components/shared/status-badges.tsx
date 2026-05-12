import { Badge } from '@/components/ui/badge'
import type { SwapStatus, ProductStatus, TrustLevel, ProductCondition } from '@/types'

interface SwapStatusBadgeProps {
  status: SwapStatus | string
  className?: string
}

const SWAP_STATUS_CONFIG: Record<SwapStatus, { label: string; variant: any }> = {
  'pending':          { label: 'Pending',         variant: 'pending' },
  'in_discussion':    { label: 'In Discussion',    variant: 'info' },
  'under_review':     { label: 'Under Review',     variant: 'warning' },
  'approved':         { label: 'Approved',         variant: 'approved' },
  'rejected':         { label: 'Rejected',         variant: 'rejected' },
  'payment_pending':  { label: 'Payment Pending',  variant: 'warning' },
  'exchange_setup':   { label: 'Exchange Setup',   variant: 'info' },
  'in_progress':      { label: 'In Progress',      variant: 'in-progress' },
  'completed':        { label: 'Completed',        variant: 'completed' },
  'cancelled':        { label: 'Cancelled',        variant: 'cancelled' },
  'disputed':         { label: 'Disputed',         variant: 'rejected' },
}

const normalizeSwapStatusForDisplay = (status: SwapStatus | string): SwapStatus | undefined => {
  const normalized = status === 'accepted' ? 'in_discussion' : status.replace(/-/g, '_')
  return normalized in SWAP_STATUS_CONFIG ? normalized as SwapStatus : undefined
}

export function SwapStatusBadge({ status, className }: SwapStatusBadgeProps) {
  const normalized = normalizeSwapStatusForDisplay(status)
  const config = normalized ? SWAP_STATUS_CONFIG[normalized] : { label: String(status), variant: 'outline' }
  return <Badge variant={config.variant} className={className}>{config.label}</Badge>
}

// ── Product status ────────────────────────────────────────────

const PRODUCT_STATUS_CONFIG: Record<ProductStatus, { label: string; variant: any }> = {
  'active':   { label: 'Active',    variant: 'approved' },
  'available': { label: 'Active',   variant: 'approved' },
  'reserved': { label: 'Reserved',  variant: 'warning' },
  'swapped':  { label: 'Swapped',   variant: 'completed' },
  'pending':  { label: 'Pending',   variant: 'pending' },
  'inactive': { label: 'Inactive',  variant: 'cancelled' },
  'rejected': { label: 'Rejected',  variant: 'rejected' },
}

const PRODUCT_STATUS_FALLBACK = { label: 'Unknown', variant: 'outline' }

export function ProductStatusBadge({ status }: { status: ProductStatus | string }) {
  const config = PRODUCT_STATUS_CONFIG[status as ProductStatus] ?? PRODUCT_STATUS_FALLBACK
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ── Trust level ───────────────────────────────────────────────

const TRUST_CONFIG: Record<TrustLevel, { label: string; variant: any }> = {
  'trusted': { label: 'Trusted User',  variant: 'trusted' },
  'new':     { label: 'New User',      variant: 'new' },
  'risky':   { label: 'Risky User',    variant: 'risky' },
}

export function TrustBadge({ level }: { level: TrustLevel }) {
  const config = TRUST_CONFIG[level]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ── Condition ─────────────────────────────────────────────────

const CONDITION_CONFIG: Record<ProductCondition, { label: string; variant: any }> = {
  'new':       { label: 'New',       variant: 'approved' },
  'like-new':  { label: 'Like New',  variant: 'success' },
  'good':      { label: 'Good',      variant: 'info' },
  'fair':      { label: 'Fair',      variant: 'warning' },
  'poor':      { label: 'Poor',      variant: 'rejected' },
}

const CONDITION_FALLBACK = CONDITION_CONFIG.good

export function ConditionBadge({ condition }: { condition: ProductCondition | string }) {
  const config = CONDITION_CONFIG[condition as ProductCondition] ?? CONDITION_FALLBACK
  return <Badge variant={config.variant}>{config.label}</Badge>
}
