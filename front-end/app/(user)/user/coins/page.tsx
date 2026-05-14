'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Coins, Gift, Package, Sparkles, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { API_BASE_URL as API_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'

type WalletTransactionMetadata = {
  [key: string]: unknown
  packageId?: string
  package_id?: string
  paymobPaymentUrl?: string
  paymobIframeUrl?: string
}

type WalletTransaction = {
  id: string
  type: string
  direction: 'debit' | 'credit' | 'hold' | 'release' | 'refund' | 'adjustment'
  amount: number
  currency: 'coins' | 'EGP'
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'expired'
  description: string
  metadata?: WalletTransactionMetadata
  checkout_url?: string
  payment_url?: string
  iframe_url?: string
  checkoutUrl?: string
  paymentUrl?: string
  iframeUrl?: string
  can_continue?: boolean
  canContinue?: boolean
  createdAt: string
}

type WalletSummary = {
  coins: number
  held_coins: number
  total_coins_earned: number
  total_coins_spent: number
  monthly_free_swaps_used: number
  monthly_free_swaps_limit: number
  free_swaps_remaining: number
  extra_swap_slots: number
  priority_matches_available: number
  transactions: WalletTransaction[]
}

type CoinPackage = {
  id: string
  name: string
  coins: number
  priceEGP: number
  currency: 'EGP'
  isPopular: boolean
}

type CoinPackagesResponse = {
  packages?: CoinPackage[]
}

type CheckoutResponse = {
  checkoutUrl?: string
  paymentUrl?: string
  iframeUrl?: string
  canContinue?: boolean
  message?: string
}

const COIN_USES = [
  { icon: Package, title: 'Feature a product', cost: 10, desc: '30-day featured badge', action: null },
  { icon: ArrowLeftRight, title: 'Extra swap slot', cost: 5, desc: 'When monthly free slots are used', action: 'extra-swap-slot' },
  { icon: Sparkles, title: 'Priority matching', cost: 5, desc: 'Buy a credit to apply from AI Matches', action: 'priority-matching' },
] as const

const COIN_REWARDS = [
  { title: 'Complete a swap', reward: 5 },
  { title: 'Verify phone', reward: 10 },
  { title: 'Complete profile', reward: 10 },
] as const

const formatType = (type: string) =>
  type
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const formatTransactionAmount = (tx: WalletTransaction) => {
  const amount = `${tx.amount.toLocaleString()} ${tx.currency}`

  if (tx.type === 'package_purchase_pending' && tx.status === 'pending') {
    return `${amount} awaiting payment`
  }

  if (tx.type === 'package_purchase_pending' && (tx.status === 'failed' || tx.status === 'expired')) {
    return `${amount} not credited`
  }

  if (tx.direction === 'credit' || tx.direction === 'refund') return `+${amount}`
  if (tx.direction === 'hold') return `Held ${amount}`
  if (tx.direction === 'debit' || tx.direction === 'release') return `-${amount}`

  return amount
}

const getTransactionCheckoutUrl = (tx: WalletTransaction) =>
  tx.checkoutUrl ||
  tx.checkout_url ||
  tx.paymentUrl ||
  tx.payment_url ||
  tx.iframeUrl ||
  tx.iframe_url ||
  tx.metadata?.paymobPaymentUrl ||
  tx.metadata?.paymobIframeUrl ||
  ''

const getTransactionPackageId = (tx: WalletTransaction) =>
  tx.metadata?.packageId ||
  tx.metadata?.package_id ||
  ''

const getTransactionSupportText = (tx: WalletTransaction) => {
  if (tx.type !== 'package_purchase_pending') return ''
  if (tx.status === 'pending') return 'Coins are not credited until Paymob confirms payment.'
  if (tx.status === 'failed') return 'Payment failed; coins were not credited.'
  if (tx.status === 'expired') return 'Checkout expired; coins were not credited.'
  return ''
}

const getPackageCheckoutActionLabel = (tx: WalletTransaction, packages: CoinPackage[]) => {
  if (tx.type !== 'package_purchase_pending') return ''
  if (tx.status === 'pending' && getTransactionCheckoutUrl(tx)) return 'Continue payment'

  const packageId = getTransactionPackageId(tx)
  const packageAvailable = packages.some(pkg => pkg.id === packageId)
  if ((tx.status === 'pending' || tx.status === 'failed' || tx.status === 'expired') && packageAvailable) {
    return 'Try again'
  }

  return ''
}

const transactionStatusVariant = (status: WalletTransaction['status']): 'approved' | 'pending' | 'rejected' | 'outline' => {
  if (status === 'completed') return 'approved'
  if (status === 'failed') return 'rejected'
  if (status === 'refunded') return 'outline'
  if (status === 'expired') return 'outline'
  return 'pending'
}

export default function CoinsPage() {
  const router = useRouter()
  const { getCurrentUser, updateUser } = useApp()
  const user = getCurrentUser()!
  const [wallet, setWallet] = useState<WalletSummary | null>(null)
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [packagesLoading, setPackagesLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [packageCheckoutId, setPackageCheckoutId] = useState<string | null>(null)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const applyWallet = useCallback((nextWallet: WalletSummary) => {
    setWallet(nextWallet)
    updateUser(user.id, {
      coinBalance: nextWallet.coins,
      heldCoins: nextWallet.held_coins,
      totalCoinsEarned: nextWallet.total_coins_earned,
      totalCoinsSpent: nextWallet.total_coins_spent,
      monthlyFreeSwapsUsed: nextWallet.monthly_free_swaps_used,
      extraSwapSlots: nextWallet.extra_swap_slots,
      priorityMatchesAvailable: nextWallet.priority_matches_available,
    })
  }, [updateUser, user.id])

  const requestJson = useCallback(async <T,>(path: string, options?: RequestInit): Promise<T> => {
    const token = localStorage.getItem('token') || ''
    const headers = new Headers(options?.headers)
    headers.set('Authorization', `Bearer ${token}`)

    if (options?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    })

    let data: any = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token')
        router.push('/login')
      }

      throw new Error(data?.message || 'Wallet request failed.')
    }

    return data as T
  }, [router])

  const requestWallet = useCallback(async (path = '/users/me/wallet', options?: RequestInit) => {
    const data = await requestJson<{ wallet?: WalletSummary }>(path, options)

    if (!data?.wallet) {
      throw new Error('Wallet response was missing.')
    }

    return data.wallet as WalletSummary
  }, [requestJson])

  const loadWallet = useCallback(async ({ silent = false, cancelled = () => false } = {}) => {
    try {
      if (!silent) setLoading(true)
      const nextWallet = await requestWallet()
      if (!cancelled()) applyWallet(nextWallet)
    } catch (error) {
      if (!silent && !cancelled()) {
        toast.error(error instanceof Error ? error.message : 'Could not load wallet.')
      }
    } finally {
      if (!silent && !cancelled()) setLoading(false)
    }
  }, [applyWallet, requestWallet])

  const loadCoinPackages = useCallback(async ({ cancelled = () => false } = {}) => {
    try {
      setPackagesLoading(true)
      const data = await requestJson<CoinPackagesResponse>('/users/me/wallet/packages')
      if (!cancelled()) setCoinPackages(Array.isArray(data.packages) ? data.packages : [])
    } catch (error) {
      if (!cancelled()) {
        setCoinPackages([])
        toast.error(error instanceof Error ? error.message : 'Could not load coin packages.')
      }
    } finally {
      if (!cancelled()) setPackagesLoading(false)
    }
  }, [requestJson])

  useEffect(() => {
    let cancelled = false
    const isCancelled = () => cancelled

    loadWallet({ cancelled: isCancelled })
    loadCoinPackages({ cancelled: isCancelled })

    const handleFocus = () => {
      loadWallet({ silent: true, cancelled: isCancelled })
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
    }
  }, [loadCoinPackages, loadWallet])

  const handleWalletAction = async (action: 'extra-swap-slot' | 'priority-matching') => {
    try {
      setPendingAction(action)
      const nextWallet = await requestWallet(`/users/me/wallet/${action}`, {
        method: 'POST',
      })
      applyWallet(nextWallet)
      toast.success(action === 'extra-swap-slot' ? 'Extra swap slot added' : 'Priority matching credit added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Coin action failed.')
    } finally {
      setPendingAction(null)
    }
  }

  const handlePackageCheckout = async (coinPackage: CoinPackage) => {
    try {
      setPackageCheckoutId(coinPackage.id)
      const data = await requestJson<CheckoutResponse>('/users/me/wallet/packages/checkout', {
        method: 'POST',
        body: JSON.stringify({ packageId: coinPackage.id }),
      })
      const paymentUrl = data.checkoutUrl || data.paymentUrl || data.iframeUrl

      if (!paymentUrl) {
        throw new Error('Payment checkout URL was missing.')
      }

      window.location.href = paymentUrl
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start Paymob checkout.')
      setPackageCheckoutId(null)
    }
  }

  const handleHistoryPackageCheckout = async (tx: WalletTransaction) => {
    const checkoutUrl = getTransactionCheckoutUrl(tx)

    if (tx.status === 'pending' && checkoutUrl) {
      setPackageCheckoutId(tx.id)
      window.location.href = checkoutUrl
      return
    }

    const packageId = getTransactionPackageId(tx)
    const coinPackage = coinPackages.find(pkg => pkg.id === packageId)

    if (!coinPackage) {
      toast.error('This coin package is no longer available.')
      return
    }

    await handlePackageCheckout(coinPackage)
  }

  const visibleWallet = wallet
  const visibleTransactions = visibleWallet
    ? historyExpanded
      ? visibleWallet.transactions
      : visibleWallet.transactions.slice(0, 3)
    : []
  const canToggleHistory = Boolean(visibleWallet && visibleWallet.transactions.length > 3)

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5 lg:space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coins</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your in-platform currency for swaps and features</p>
      </div>

      <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 lg:p-6 text-white">
        {visibleWallet ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-white/70 text-sm mb-1">Available coins</p>
                <p className="text-4xl font-bold">{visibleWallet.coins.toLocaleString()}</p>
                <p className="text-white/60 text-sm mt-1">
                  Estimated value: {visibleWallet.coins.toLocaleString()} EGP
                </p>
              </div>
              <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <Coins className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              <div><p className="text-white/60 text-xs">Held coins</p><p className="font-semibold">{visibleWallet.held_coins.toLocaleString()}</p></div>
              <div><p className="text-white/60 text-xs">Free swaps used this month</p><p className="font-semibold">{visibleWallet.monthly_free_swaps_used.toLocaleString()} / {visibleWallet.monthly_free_swaps_limit.toLocaleString()}</p></div>
              <div><p className="text-white/60 text-xs">Free swaps remaining</p><p className="font-semibold">{visibleWallet.free_swaps_remaining.toLocaleString()}</p></div>
              <div><p className="text-white/60 text-xs">Total earned</p><p className="font-semibold">{visibleWallet.total_coins_earned.toLocaleString()}</p></div>
              <div><p className="text-white/60 text-xs">Total spent</p><p className="font-semibold">{visibleWallet.total_coins_spent.toLocaleString()}</p></div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-white/70 text-sm mb-1">Available coins</p>
              <p className="text-lg font-semibold">Loading wallet...</p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <Coins className="h-7 w-7 text-white" />
            </div>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Extra swap slots</p>
          <p className="text-2xl font-bold mt-1">{visibleWallet ? visibleWallet.extra_swap_slots.toLocaleString() : '-'}</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Priority matching credits</p>
          <p className="text-2xl font-bold mt-1">{visibleWallet ? visibleWallet.priority_matches_available.toLocaleString() : '-'}</p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
        <h2 className="font-semibold mb-4">What you can do with coins</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {COIN_USES.map(({ icon: Icon, title, cost, desc, action }) => (
            <div key={title} className="bg-muted/40 rounded-xl p-3 lg:p-4">
              <Icon className="h-5 w-5 text-primary mb-2" />
              <p className="font-medium text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              <p className="text-sm font-bold text-amber-600 mt-2">{cost} coins</p>
              {action && (
                <Button
                  className="w-full mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => handleWalletAction(action)}
                  loading={pendingAction === action}
                  disabled={loading || pendingAction !== null}
                >
                  Buy
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 lg:p-5">
        <h2 className="font-semibold mb-4">Earn coin rewards</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {COIN_REWARDS.map(({ title, reward }) => (
            <div key={title} className="bg-muted/40 rounded-xl p-3 lg:p-4">
              <Gift className="h-5 w-5 text-primary mb-2" />
              <p className="font-medium text-sm">{title}</p>
              <p className="text-sm font-bold text-green-600 mt-2">+{reward} coins</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-semibold mb-4">Buy coin packages</h2>
        {packagesLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm bg-card rounded-2xl border border-border">
            Loading packages...
          </div>
        ) : coinPackages.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm bg-card rounded-2xl border border-border">
            Coin packages are not available.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {coinPackages.map(pkg => (
            <div
              key={pkg.id}
              className={cn(
                'relative bg-card rounded-2xl border p-4 lg:p-5',
                pkg.isPopular ? 'border-primary ring-2 ring-primary/20' : 'border-border'
              )}
            >
              {pkg.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-xs">Most popular</Badge>
                </div>
              )}
              <div className="text-center">
                <Coins className="h-7 w-7 mx-auto mb-2 text-amber-500" />
                <p className="font-bold text-xl">{pkg.coins.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{pkg.name}</p>
                <p className="text-2xl font-bold text-primary mt-3">{pkg.priceEGP.toLocaleString()} {pkg.currency}</p>
              </div>
              <Button
                className="w-full mt-4"
                variant="outline"
                size="sm"
                onClick={() => handlePackageCheckout(pkg)}
                loading={packageCheckoutId === pkg.id}
                disabled={packageCheckoutId !== null}
              >
                Buy with Paymob
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">Coins are credited after Paymob confirms payment.</p>
            </div>
          ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Transaction history</h2>
          {canToggleHistory && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setHistoryExpanded(current => !current)}
              className="gap-1.5"
            >
              {historyExpanded ? 'Show less' : 'Show all'}
              <ChevronDown className={cn('h-4 w-4 transition-transform', historyExpanded && 'rotate-180')} />
            </Button>
          )}
        </div>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {loading || !visibleWallet ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading wallet...</div>
          ) : visibleWallet.transactions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">No coin transactions yet</div>
          ) : (
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map(tx => {
                  const supportText = getTransactionSupportText(tx)
                  const checkoutActionLabel = getPackageCheckoutActionLabel(tx, coinPackages)
                  const packageActionLoading =
                    packageCheckoutId === tx.id ||
                    Boolean(getTransactionPackageId(tx) && packageCheckoutId === getTransactionPackageId(tx))

                  return (
                    <tr key={tx.id}>
                      <td className="text-sm">
                        <span className="font-medium">{tx.description || formatType(tx.type)}</span>
                        <span className="block text-xs text-muted-foreground">{formatType(tx.type)}</span>
                        {supportText && (
                          <span className="block text-xs text-muted-foreground mt-1">{supportText}</span>
                        )}
                        {checkoutActionLabel && (
                          <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleHistoryPackageCheckout(tx)}
                            disabled={packageCheckoutId !== null || (checkoutActionLabel === 'Try again' && packagesLoading)}
                          >
                            {packageActionLoading ? 'Opening...' : checkoutActionLabel}
                          </button>
                        )}
                      </td>
                      <td className="text-sm font-medium">{formatTransactionAmount(tx)}</td>
                      <td>
                        <Badge variant={transactionStatusVariant(tx.status)} className="text-xs">
                          {tx.status}
                        </Badge>
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
