'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_BASE_URL as API_URL } from '@/lib/api-config'

type PaymentPurpose = 'coin_package' | 'service_fee'

type ConfirmReturnResponse = {
  success?: boolean
  status?: 'pending' | 'completed' | 'failed' | 'expired'
  message?: string
  reason?: string
  purpose?: PaymentPurpose
  swapId?: string
  swap?: {
    id?: string
    _id?: string
  } | null
}

export default function CoinPaymentFailurePage() {
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const [loading, setLoading] = useState(Boolean(queryString))
  const [confirmed, setConfirmed] = useState(false)
  const [purpose, setPurpose] = useState<PaymentPurpose>('coin_package')
  const [swapId, setSwapId] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const confirmReturn = async () => {
      if (!queryString) {
        setLoading(false)
        return
      }

      const token = localStorage.getItem('token') || ''
      if (!token) {
        setLoading(false)
        return
      }

      const query: Record<string, string> = {}
      new URLSearchParams(queryString).forEach((value, key) => {
        query[key] = value
      })

      try {
        const response = await fetch(`${API_URL}/payments/paymob/confirm-return`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        })
        const data = await response.json().catch(() => null) as ConfirmReturnResponse | null

        if (cancelled) return

        const nextPurpose: PaymentPurpose = data?.purpose === 'service_fee' ? 'service_fee' : 'coin_package'
        setPurpose(nextPurpose)
        setSwapId(data?.swapId || data?.swap?.id || data?.swap?._id || null)
        setConfirmed(data?.success === true || data?.status === 'completed')
        setReason(data?.reason || data?.message || null)
      } catch (error) {
        if (!cancelled) {
          setReason(error instanceof Error ? error.message : null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    confirmReturn()

    return () => {
      cancelled = true
    }
  }, [queryString])

  const isServiceFee = purpose === 'service_fee'
  const title = confirmed
    ? isServiceFee
      ? 'Service fee paid'
      : 'Payment confirmed'
    : isServiceFee
      ? 'Service fee payment incomplete'
      : 'Payment incomplete'
  const message = confirmed
    ? isServiceFee
      ? 'Your service fee was confirmed successfully.'
      : 'Your payment was confirmed successfully.'
    : reason || (isServiceFee ? 'Service fee payment was not completed.' : 'Payment was not completed.')
  const buttonHref = isServiceFee ? (swapId ? `/user/swaps/${swapId}` : '/user/swaps') : '/user/coins'
  const buttonLabel = isServiceFee ? (swapId ? 'Back to swap' : 'Back to swaps') : 'Back to coins'

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        {loading ? (
          <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
        ) : confirmed ? (
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
        ) : (
          <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
        )}
        <h1 className="text-2xl font-bold">{loading ? 'Checking payment' : title}</h1>
        <p className="text-muted-foreground mt-3">
          {loading ? 'Confirming the payment result...' : message}
        </p>
        <Button asChild className="w-full mt-6" variant="outline">
          <Link href={buttonHref}>{buttonLabel}</Link>
        </Button>
      </div>
    </div>
  )
}
