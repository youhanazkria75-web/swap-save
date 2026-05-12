'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertCircle, CheckCircle2, Coins, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/contexts/app-context'
import { API_BASE_URL as API_URL } from '@/lib/api-config'

type PaymentPurpose = 'coin_package' | 'service_fee'
type PageStatus = 'confirming' | 'confirmed' | 'pending' | 'failed'

type WalletSummary = {
  coins: number
  held_coins: number
  total_coins_earned: number
  total_coins_spent: number
  monthly_free_swaps_used: number
  extra_swap_slots: number
  priority_matches_available: number
}

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
    status?: string
  } | null
  wallet?: WalletSummary
}

const PENDING_CONFIRMATION_MESSAGE =
  'Payment received, but confirmation is still pending. Please refresh shortly or contact support.'

const SERVICE_FEE_PENDING_MESSAGE =
  'Payment was received by Paymob, but the platform is still waiting for confirmation.'

export default function CoinPaymentSuccessPage() {
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const { getCurrentUser, updateUser } = useApp()
  const user = getCurrentUser()
  const [coins, setCoins] = useState<number | null>(null)
  const [purpose, setPurpose] = useState<PaymentPurpose>('coin_package')
  const [swapId, setSwapId] = useState<string | null>(null)
  const [status, setStatus] = useState<PageStatus>('confirming')
  const [message, setMessage] = useState('Confirming your payment...')
  const [detail, setDetail] = useState<string | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)

  useEffect(() => {
    let cancelled = false

    const applyWallet = (wallet: WalletSummary) => {
      setCoins(wallet.coins)

      if (user?.id) {
        updateUser(user.id, {
          coinBalance: wallet.coins,
          heldCoins: wallet.held_coins,
          totalCoinsEarned: wallet.total_coins_earned,
          totalCoinsSpent: wallet.total_coins_spent,
          monthlyFreeSwapsUsed: wallet.monthly_free_swaps_used,
          extraSwapSlots: wallet.extra_swap_slots,
          priorityMatchesAvailable: wallet.priority_matches_available,
        })
      }
    }

    const refetchWallet = async () => {
      const token = localStorage.getItem('token') || ''
      const response = await fetch(`${API_URL}/users/me/wallet`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await response.json().catch(() => null) as { wallet?: WalletSummary } | null
      const wallet = data?.wallet

      if (!cancelled && response.ok && wallet) {
        applyWallet(wallet)
      }
    }

    const applyConfirmation = async (data: ConfirmReturnResponse | null, responseOk: boolean) => {
      const nextPurpose: PaymentPurpose = data?.purpose === 'service_fee' ? 'service_fee' : 'coin_package'
      const completed = data?.success === true || (responseOk && data?.status === 'completed')

      if (nextPurpose === 'service_fee') {
        const nextSwapId = data?.swapId || data?.swap?.id || data?.swap?._id || null

        if (!cancelled) {
          setPurpose('service_fee')
          setSwapId(nextSwapId)
          setCoins(null)
          setStatus(completed ? 'confirmed' : 'pending')
          setMessage(completed ? 'Your service fee was confirmed successfully.' : SERVICE_FEE_PENDING_MESSAGE)
          setDetail(completed ? null : data?.reason || PENDING_CONFIRMATION_MESSAGE)
        }

        return
      }

      if (data?.wallet) {
        applyWallet(data.wallet)
      } else if (responseOk) {
        await refetchWallet()
      }

      if (!cancelled) {
        const alreadyCompleted = data?.message === 'Paymob webhook already processed'

        setPurpose('coin_package')
        setSwapId(null)
        setStatus(completed ? 'confirmed' : 'pending')
        setMessage(
          completed
            ? alreadyCompleted
              ? 'Payment already confirmed'
              : 'Payment confirmed'
            : data?.reason || PENDING_CONFIRMATION_MESSAGE
        )
        setDetail(null)
      }
    }

    const confirmReturn = async () => {
      const token = localStorage.getItem('token') || ''
      const query: Record<string, string> = {}
      new URLSearchParams(queryString).forEach((value, key) => {
        query[key] = value
      })

      if (!token || Object.keys(query).length === 0) {
        throw new Error('Missing payment confirmation data.')
      }

      const response = await fetch(`${API_URL}/payments/paymob/confirm-return`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      })
      const data = await response.json().catch(() => null) as ConfirmReturnResponse | null

      if (!response.ok && !data?.purpose) {
        throw new Error(data?.reason || data?.message || PENDING_CONFIRMATION_MESSAGE)
      }

      await applyConfirmation(data, response.ok)
    }

    confirmReturn().catch(async (error) => {
      if (cancelled) return

      setPurpose('coin_package')
      setStatus('pending')
      setMessage(PENDING_CONFIRMATION_MESSAGE)
      setDetail(error instanceof Error ? error.message : null)

      try {
        await refetchWallet()
      } catch {
        if (!cancelled) setCoins(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [queryString, updateUser, user?.id])

  const handleCheckPaymentStatus = async () => {
    if (!swapId) return

    try {
      setCheckingStatus(true)
      const token = localStorage.getItem('token') || ''
      const response = await fetch(`${API_URL}/swaps/${swapId}/service-fee/reconcile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await response.json().catch(() => null) as ConfirmReturnResponse | null
      const completed = data?.success === true || data?.status === 'completed'

      if (completed) {
        setStatus('confirmed')
        setMessage('Your service fee was confirmed successfully.')
        setDetail(null)
        return
      }

      if (!response.ok && response.status !== 202) {
        setStatus('failed')
        setMessage(data?.reason || data?.message || 'The service fee payment could not be verified.')
        setDetail(null)
        return
      }

      setStatus('pending')
      setMessage(SERVICE_FEE_PENDING_MESSAGE)
      setDetail(data?.reason || PENDING_CONFIRMATION_MESSAGE)
    } catch (error) {
      setStatus('failed')
      setMessage(error instanceof Error ? error.message : 'The service fee payment could not be verified.')
      setDetail(null)
    } finally {
      setCheckingStatus(false)
    }
  }

  const isConfirming = status === 'confirming'
  const isPending = status === 'pending'
  const isFailed = status === 'failed'
  const isServiceFee = purpose === 'service_fee'
  const title = isConfirming
    ? 'Confirming payment'
    : isServiceFee
      ? isFailed
        ? 'Service fee payment incomplete'
        : isPending
        ? 'Service fee confirmation pending'
        : 'Service fee paid'
      : isPending
        ? 'Confirmation pending'
        : 'Payment confirmed'
  const buttonHref = isServiceFee ? (swapId ? `/user/swaps/${swapId}` : '/user/swaps') : '/user/coins'
  const buttonLabel = isServiceFee ? (swapId ? 'Back to swap' : 'Back to swaps') : 'Back to coins'

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-card rounded-2xl border border-border p-8 text-center">
        {isConfirming ? (
          <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
        ) : isFailed ? (
          <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
        ) : isPending ? (
          <AlertCircle className="h-12 w-12 text-amber-600 mx-auto mb-4" />
        ) : (
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-3">
          {message}
        </p>
        {detail && detail !== message && (
          <p className="text-xs text-muted-foreground mt-2">
            {detail}
          </p>
        )}
        {purpose === 'coin_package' && coins !== null && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Coins className="h-4 w-4 text-amber-500" />
            Current balance: <span className="font-semibold">{coins.toLocaleString()} coins</span>
          </div>
        )}
        {isServiceFee && isPending && swapId && (
          <Button className="w-full mt-6" onClick={handleCheckPaymentStatus} loading={checkingStatus}>
            Check payment status
          </Button>
        )}
        <Button asChild className={isServiceFee && isPending && swapId ? 'w-full mt-3' : 'w-full mt-6'} variant={isServiceFee && isPending && swapId ? 'outline' : 'default'}>
          <Link href={buttonHref}>{buttonLabel}</Link>
        </Button>
      </div>
    </div>
  )
}
