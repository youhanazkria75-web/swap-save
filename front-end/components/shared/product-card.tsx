'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Heart, MapPin, Star, Eye, ArrowLeftRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import { ConditionBadge } from '@/components/shared/status-badges'
import { useApp } from '@/contexts/app-context'
import { API_BASE_URL as API_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import type { Product, User } from '@/types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

interface ProductCardProps {
  product: Product
  owner?: User
  currentUserId?: string | null
  showOwner?: boolean
  aiScore?: number
  className?: string
  compact?: boolean
  showActionButton?: boolean
  isSaved?: boolean
  onToggleSaved?: (productId: string) => Promise<{ isSaved: boolean; savedCount: number } | void> | void
}

export function ProductCard({
  product,
  owner,
  currentUserId: currentUserIdProp,
  showOwner = false,
  aiScore,
  className,
  compact = false,
  showActionButton = false,
  isSaved: controlledIsSaved,
  onToggleSaved,
}: ProductCardProps) {
  const router = useRouter()
  const { currentUserId: contextCurrentUserId } = useApp()
  const currentUserId = currentUserIdProp ?? contextCurrentUserId
  const [isSaved, setIsSaved] = useState(controlledIsSaved ?? product.isSaved ?? false)
  const [savedCount, setSavedCount] = useState(product.savedCount)
  const [isSaving, setIsSaving] = useState(false)
  const isAvailable = product.status === 'active' || product.status === 'available'
  const isOwnProduct = Boolean(currentUserId && currentUserId === product.ownerId)

  useEffect(() => {
    setIsSaved(controlledIsSaved ?? product.isSaved ?? false)
  }, [controlledIsSaved, product.id, product.isSaved])

  useEffect(() => {
    setSavedCount(product.savedCount)
  }, [product.savedCount])

  const handleSave = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (isSaving) {
      return
    }

    if (isOwnProduct) {
      toast.info('You cannot save your own product.')
      return
    }

    try {
      setIsSaving(true)

      if (onToggleSaved) {
        const result = await onToggleSaved(product.id)
        if (result) {
          setIsSaved(result.isSaved)
          setSavedCount(result.savedCount)
        }
        return
      }

      const token = localStorage.getItem('token') || ''

      if (!token) {
        router.push('/login')
        return
      }

      const response = await fetch(`${API_URL}/products/${product.id}/save`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }

        throw new Error(
          isRecord(data) && typeof data.message === 'string'
            ? data.message
            : 'Failed to update saved status.'
        )
      }

      const nextIsSaved =
        isRecord(data) && typeof data.is_saved === 'boolean'
          ? data.is_saved
          : !isSaved
      const fallbackSavedCount = Math.max(0, savedCount + (nextIsSaved ? 1 : -1))
      const nextSavedCount =
        isRecord(data) && typeof data.saved_count === 'number'
          ? data.saved_count
          : fallbackSavedCount

      setIsSaved(nextIsSaved)
      setSavedCount(nextSavedCount)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error while updating saved status.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col bg-card rounded-xl border border-border overflow-hidden product-card-hover',
        className
      )}
    >
      {/* Image */}
      <Link href={`/products/${product.id}`} className="block">
        <div className={cn('relative overflow-hidden bg-muted', compact ? 'h-40' : 'h-48')}>
          {product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ArrowLeftRight className="h-8 w-8 opacity-30" />
            </div>
          )}

          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Featured badge */}
          {product.isFeatured && (
            <div className="absolute top-2 left-2">
              <Badge variant="featured" className="gap-1 shadow-sm">
                <Sparkles className="h-3 w-3" /> Featured
              </Badge>
            </div>
          )}

          {/* AI score */}
          {aiScore !== undefined && (
            <div className="absolute top-2 left-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm">
                🤖 {aiScore}% match
              </span>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            aria-disabled={isSaving || isOwnProduct}
            aria-label={isOwnProduct ? 'Cannot save your own product' : isSaved ? 'Remove from saved products' : 'Save product'}
            title={isOwnProduct ? 'You cannot save your own product' : isSaved ? 'Remove from saved products' : 'Save product'}
            className={cn(
              'absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-all',
              isSaved
                ? 'bg-red-50 text-red-500'
                : 'bg-white/90 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-500',
              (isSaving || isOwnProduct) && 'cursor-not-allowed opacity-60 group-hover:opacity-60'
            )}
          >
            <Heart className={cn('h-4 w-4', isSaved && 'fill-current')} />
          </button>

          {/* Status indicator */}
          {!isAvailable && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Badge variant={product.status === 'swapped' ? 'completed' : 'pending'} className="shadow-sm">
                {product.status === 'swapped' ? 'Swapped' : product.status}
              </Badge>
            </div>
          )}
        </div>
      </Link>

      {/* Content */}
      <div className={cn('flex flex-1 flex-col p-4', compact && 'p-3')}>
        {/* Category + condition */}
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <Badge variant="secondary" className="text-[11px] px-1.5 py-0 truncate">{product.category}</Badge>
          <ConditionBadge condition={product.condition} />
        </div>

        {/* Title */}
        <Link href={`/products/${product.id}`}>
          <h3 className={cn(
            'min-h-[2.5rem] font-semibold leading-snug hover:text-primary transition-colors line-clamp-2',
            compact ? 'text-sm' : 'text-sm sm:text-base'
          )}>
            {product.title}
          </h3>
        </Link>

        {/* Value */}
        <p className="mt-1.5 text-base font-bold text-primary leading-tight">
          ~{product.estimatedValue.toLocaleString()} EGP
          <span className="text-xs font-normal text-muted-foreground ml-1">est. value</span>
        </p>

        {/* Location + views */}
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{product.location}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-0.5">
              <Eye className="h-3 w-3" /> {product.viewCount}
            </span>
            <span className="flex items-center gap-0.5">
              <Heart className="h-3 w-3" /> {savedCount}
            </span>
          </div>
        </div>

        {/* Owner info */}
        {showOwner && owner && (
          <div className="mt-auto pt-3 border-t border-border flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarImage src={owner.avatar} alt={`${owner.firstName} ${owner.lastName}`} />
                <AvatarFallback className="text-[10px] bg-brand-100 text-brand-700">
                {owner.firstName[0]}{owner.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs font-medium">{owner.firstName} {owner.lastName}</span>
              {owner.trustScore >= 70 && (
                <span className="shrink-0 text-[10px] text-green-600 font-medium">&#10003; Trusted</span>
              )}
            </div>
            {owner.ratingCount > 0 && (
              <div className="shrink-0 flex items-center gap-0.5 text-xs text-amber-500">
                <Star className="h-3 w-3 fill-current" />
                <span className="font-medium">{owner.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        {(!compact || showActionButton) && (
          isAvailable ? (
            <Button asChild className="w-full mt-3" size="sm" variant="outline">
              <Link href={`/products/${product.id}`}>
                <ArrowLeftRight className="h-3.5 w-3.5" />
                View & Swap
              </Link>
            </Button>
          ) : (
            <Button className="w-full mt-3" size="sm" variant="outline" disabled>
              {product.status === 'swapped' ? 'Already Swapped' : 'Not Available'}
            </Button>
          )
        )}
      </div>
    </div>
  )
}

// ── Grid wrapper ──────────────────────────────────────────────

interface ProductGridProps {
  products: Product[]
  owners?: Record<string, User>
  currentUserId?: string | null
  showOwner?: boolean
  aiScores?: Record<string, number>
  compact?: boolean
  className?: string
  savedStates?: Record<string, boolean>
  onToggleSaved?: ProductCardProps['onToggleSaved']
}

export function ProductGrid({
  products,
  owners,
  currentUserId,
  showOwner,
  aiScores,
  compact,
  className,
  savedStates,
  onToggleSaved,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ArrowLeftRight className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="font-medium text-muted-foreground">No products found</p>
        <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters or search terms</p>
      </div>
    )
  }

  return (
    <div className={cn(
      'grid gap-4 sm:gap-5',
      compact
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      className
    )}>
      {products.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          owner={owners?.[product.ownerId]}
          currentUserId={currentUserId}
          showOwner={showOwner}
          aiScore={aiScores?.[product.id]}
          compact={compact}
          isSaved={savedStates?.[product.id] ?? product.isSaved}
          onToggleSaved={onToggleSaved}
        />
      ))}
    </div>
  )
}
