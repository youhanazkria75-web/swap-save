'use client'

import React, { createContext, useContext, useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  User, Product, SwapRequest, Message, Transaction,
  Rating, Report, Dispute,
} from '@/types'
import {
  MOCK_USERS, MOCK_PRODUCTS, MOCK_SWAPS, MOCK_MESSAGES,
  MOCK_TRANSACTIONS, MOCK_RATINGS,
  MOCK_REPORTS, MOCK_DISPUTES,
} from '@/lib/mock-data'
import { API_BASE_URL } from '@/lib/api-config'

// App store interface

type EmailVerificationUser = Partial<User> & {
  id: string
  first_name?: string
  last_name?: string
  role?: string
  joined_at?: string
  street_address?: string
  is_phone_verified?: boolean
  is_admin?: boolean
  completed_swaps?: number
  total_swaps?: number
  rating_count?: number
  coin_balance?: number
  coins?: number
  held_coins?: number
  total_coins_earned?: number
  total_coins_spent?: number
  monthly_free_swaps_used?: number
  extra_swap_slots?: number
  priority_matches_available?: number
  featured_slots_used?: number
  is_suspended?: boolean
}

type WalletSummary = {
  coins?: number
  held_coins?: number
  total_coins_earned?: number
  total_coins_spent?: number
  monthly_free_swaps_used?: number
  extra_swap_slots?: number
  priority_matches_available?: number
}

interface AppStore {
  // Auth
  currentUserId: string | null
  isAuthenticated: boolean
  isAuthLoading: boolean
  hasHydrated: boolean

  // Data
  users: User[]
  products: Product[]
  swaps: SwapRequest[]
  messages: Message[]
  transactions: Transaction[]
  ratings: Rating[]
  reports: Report[]
  disputes: Dispute[]

  // UI state
  sidebarOpen: boolean
  mobileNavOpen: boolean

  // Auth actions
  login: (email: string, password: string) => Promise<{
    success: boolean
    error?: string
    code?: string
    canResendVerification?: boolean
    user?: User
  }>
  signup: (data: Partial<User> & { password: string }) => Promise<{
    success: boolean
    error?: string
    code?: string
    verificationEmailSent?: boolean
    canResendVerification?: boolean
  }>
  completeEmailVerification: (data: { token: string; user: EmailVerificationUser }) => void
  validateStoredSession: () => Promise<void>
  logout: () => void
  setHasHydrated: (value: boolean) => void

  // Product actions

  // Swap actions

  // Message actions

  // Rating actions

  // Report and dispute actions

  // Coin actions
  refreshWallet: () => Promise<void>

  // User actions
  updateUser: (userId: string, updates: Partial<User>) => void

  // UI
  setSidebarOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void

  // Computed helpers
  getCurrentUser: () => User | null
  getUserById: (id: string) => User | undefined
  getProductById: (id: string) => Product | undefined
  getSwapById: (id: string) => SwapRequest | undefined
  getProductsByUser: (userId: string) => Product[]
  getSwapsByUser: (userId: string) => SwapRequest[]
  getMessagesBySwap: (swapId: string) => Message[]
  getRatingsByUser: (userId: string) => Rating[]
  getReports: () => Report[]
  getDisputes: () => Dispute[]
}

type PersistedAppStore = Pick<AppStore, 'currentUserId' | 'isAuthenticated'>

function sanitizePersistedAppStore(state: unknown): PersistedAppStore {
  if (typeof state !== 'object' || state === null) {
    return {
      currentUserId: null,
      isAuthenticated: false,
    }
  }

  const persisted = state as Partial<AppStore>

  return {
    currentUserId: typeof persisted.currentUserId === 'string' ? persisted.currentUserId : null,
    isAuthenticated: persisted.isAuthenticated === true,
  }
}

// Counters

// Profile completeness calculator

function calcProfileCompleteness(user: Partial<User>): number {
  const checks = [
    !!user.firstName,
    !!user.lastName,
    !!user.email,
    !!user.phone,
    !!user.country,
    !!user.city,
    !!user.streetAddress,
    !!user.bio,
    !!user.avatar,
    user.isEmailVerified,
    user.isPhoneVerified,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

// Trust score calculator

function calcTrustScore(user: Partial<User>, ratings: Rating[]): number {
  let score = 20 // base
  if (user.isEmailVerified) score += 15
  if (user.isPhoneVerified) score += 10
  if (user.streetAddress)   score += 5
  if (user.bio)             score += 5
  const completeness = calcProfileCompleteness(user)
  score += Math.round(completeness * 0.1)
  const completed = user.completedSwaps || 0
  score += Math.min(completed * 3, 25)
  const userRatings = ratings.filter(r => r.ratedUserId === user.id)
  if (userRatings.length > 0) {
    const avg = userRatings.reduce((s, r) => s + r.score, 0) / userRatings.length
    score += Math.round(avg * 2)
  }
  return Math.min(100, Math.max(0, score))
}

function calcTrustLevel(score: number, isSuspended: boolean): 'new' | 'trusted' | 'risky' {
  if (isSuspended) return 'risky'
  if (score >= 70) return 'trusted'
  if (score >= 30) return 'new'
  return 'risky'
}

// Store

function mapAuthUser(user: EmailVerificationUser, fallbackEmail = ''): User {
  return {
    id: user.id,
    firstName: user.first_name || user.firstName || '',
    lastName: user.last_name || user.lastName || '',
    email: user.email || fallbackEmail,
    phone: user.phone,
    avatar: user.avatar,
    country: user.country || '',
    city: user.city || '',
    area: user.area || '',
    streetAddress: user.streetAddress || user.street_address,
    bio: user.bio,
    joinedAt: user.joinedAt || user.joined_at || new Date().toISOString(),
    isEmailVerified: Boolean(user.isEmailVerified),
    isPhoneVerified: Boolean(user.isPhoneVerified || user.is_phone_verified),
    isAdmin: user.role === 'admin' || Boolean(user.isAdmin || user.is_admin),
    trustLevel: 'new',
    trustScore: 20,
    completedSwaps: user.completedSwaps || user.completed_swaps || 0,
    totalSwaps: user.totalSwaps || user.total_swaps || 0,
    rating: user.rating || 0,
    ratingCount: user.ratingCount || user.rating_count || 0,
    coinBalance: user.coinBalance ?? user.coin_balance ?? user.coins ?? 50,
    heldCoins: user.heldCoins ?? user.held_coins ?? 0,
    totalCoinsEarned: user.totalCoinsEarned ?? user.total_coins_earned ?? 0,
    totalCoinsSpent: user.totalCoinsSpent ?? user.total_coins_spent ?? 0,
    monthlyFreeSwapsUsed: user.monthlyFreeSwapsUsed ?? user.monthly_free_swaps_used ?? 0,
    extraSwapSlots: user.extraSwapSlots ?? user.extra_swap_slots ?? 0,
    priorityMatchesAvailable: user.priorityMatchesAvailable ?? user.priority_matches_available ?? 0,
    featuredSlotsUsed: user.featuredSlotsUsed || user.featured_slots_used || 0,
    profileCompleteness: 0,
    isSuspended: Boolean(user.isSuspended || user.is_suspended),
    lastActiveAt: new Date().toISOString(),
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentUserId:   null,
      isAuthenticated: false,
      isAuthLoading:   false,
      hasHydrated:     false,
      users:           MOCK_USERS,
      products:        MOCK_PRODUCTS,
      swaps:           MOCK_SWAPS,
      messages:        MOCK_MESSAGES,
      transactions:    MOCK_TRANSACTIONS,
      ratings:         MOCK_RATINGS,
      reports:         MOCK_REPORTS,
      disputes:        MOCK_DISPUTES,
      sidebarOpen:     true,
      mobileNavOpen:   false,

      // Auth

      login: async (email, password) => {
        set({ isAuthLoading: true })
        try {
          const res = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              password,
            }),
          })

          const data = await res.json()

          if (!res.ok) {
            set({ isAuthLoading: false })
            return {
              success: false,
              error: data.message || 'Login failed',
              code: typeof data.code === 'string' ? data.code : undefined,
              canResendVerification: Boolean(data.can_resend_verification || data.canResendVerification),
            }
          }

          const mappedUser = mapAuthUser(data.user, email)
          mappedUser.profileCompleteness = calcProfileCompleteness(mappedUser)
          mappedUser.trustScore = calcTrustScore(mappedUser, get().ratings)
          mappedUser.trustLevel = calcTrustLevel(mappedUser.trustScore, mappedUser.isSuspended)

          localStorage.setItem('token', data.token)

          set(state => {
            const existingUserIndex = state.users.findIndex(
              u => u.id === mappedUser.id || u.email === mappedUser.email
            )

            const users = existingUserIndex >= 0
              ? state.users.map((user, index) =>
                  index === existingUserIndex ? { ...user, ...mappedUser } : user
                )
              : [...state.users, mappedUser]

            return {
              users,
              isAuthenticated: true,
              currentUserId: data.user.id,
              isAuthLoading: false,
            }
          })

          return { success: true, user: mappedUser }
        } catch (_error) {
          set({ isAuthLoading: false })
          return { success: false, error: 'Network error' }
        }
      },

      signup: async (data) => {
        set({ isAuthLoading: true })
        try {
          const res = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              first_name: data.firstName || '',
              last_name: data.lastName || '',
              email: data.email || '',
              password: data.password,
              phone: data.phone || '',
              country: data.country || '',
              city: data.city || '',
              area: (data as Partial<User> & { area?: string }).area || '',
              street_address: data.streetAddress || '',
            }),
          })

          const responseData = await res.json()

          if (!res.ok) {
            set({ isAuthLoading: false })
            return {
              success: false,
              error: responseData.message || 'Signup failed',
              code: typeof responseData.code === 'string' ? responseData.code : undefined,
              canResendVerification: Boolean(
                responseData.can_resend_verification || responseData.canResendVerification
              ),
            }
          }

          const mappedUser: User = {
            id: responseData.user.id,
            firstName: responseData.user.first_name || '',
            lastName: responseData.user.last_name || '',
            email: responseData.user.email || data.email || '',
            phone: data.phone,
            avatar: undefined,
            country: responseData.user.country || '',
            city: responseData.user.city || '',
            area: responseData.user.area || '',
            streetAddress: responseData.user.street_address || responseData.user.streetAddress || '',
            bio: undefined,
            joinedAt: new Date().toISOString(),
            isEmailVerified: false,
            isPhoneVerified: false,
            isAdmin: false,
            trustLevel: 'new',
            trustScore: 20,
            completedSwaps: 0,
            totalSwaps: 0,
            rating: 0,
            ratingCount: 0,
            coinBalance: responseData.user.coin_balance ?? responseData.user.coins ?? 50,
            heldCoins: responseData.user.held_coins ?? 0,
            totalCoinsEarned: responseData.user.total_coins_earned ?? 50,
            totalCoinsSpent: responseData.user.total_coins_spent ?? 0,
            monthlyFreeSwapsUsed: responseData.user.monthly_free_swaps_used ?? 0,
            extraSwapSlots: responseData.user.extra_swap_slots ?? 0,
            priorityMatchesAvailable: responseData.user.priority_matches_available ?? 0,
            featuredSlotsUsed: 0,
            profileCompleteness: calcProfileCompleteness({
              firstName: responseData.user.first_name || '',
              lastName: responseData.user.last_name || '',
              email: responseData.user.email || data.email || '',
              phone: data.phone,
              country: responseData.user.country || '',
              city: responseData.user.city || '',
              streetAddress: responseData.user.street_address || responseData.user.streetAddress || '',
            }),
            isSuspended: false,
            lastActiveAt: new Date().toISOString(),
          }

          localStorage.removeItem('token')

          set((state) => {
            const existingUserIndex = state.users.findIndex(
              (u) => u.id === mappedUser.id || u.email === mappedUser.email
            )

            const users =
              existingUserIndex >= 0
                ? state.users.map((user, index) =>
                    index === existingUserIndex ? { ...user, ...mappedUser } : user
                  )
                : [...state.users, mappedUser]

            return {
              users,
              currentUserId: null,
              isAuthenticated: false,
              isAuthLoading: false,
            }
          })

          return {
            success: true,
            verificationEmailSent: responseData.verification_email_sent !== false,
          }
        } catch (error) {
          console.error('SIGNUP ERROR:', error)
          set({ isAuthLoading: false })
          return {
            success: false,
            error: 'Network error',
          }
        }
      },

      completeEmailVerification: ({ token, user }) => {
        const mappedUser = mapAuthUser({ ...user, isEmailVerified: true })

        mappedUser.profileCompleteness = calcProfileCompleteness(mappedUser)
        mappedUser.trustScore = calcTrustScore(mappedUser, get().ratings)
        mappedUser.trustLevel = calcTrustLevel(mappedUser.trustScore, mappedUser.isSuspended)

        localStorage.setItem('token', token)

        set(state => {
          const existingUserIndex = state.users.findIndex(
            existingUser => existingUser.id === mappedUser.id || existingUser.email === mappedUser.email
          )

          const users = existingUserIndex >= 0
            ? state.users.map((existingUser, index) =>
                index === existingUserIndex ? { ...existingUser, ...mappedUser } : existingUser
              )
            : [...state.users, mappedUser]

          return {
            users,
            currentUserId: mappedUser.id,
            isAuthenticated: true,
            isAuthLoading: false,
          }
        })
      },

      validateStoredSession: async () => {
        const token = localStorage.getItem('token')

        if (!token) {
          set({ currentUserId: null, isAuthenticated: false, isAuthLoading: false, hasHydrated: true })
          return
        }

        try {
          const res = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
          const data = await res.json()

          if (!res.ok || !data.user) {
            localStorage.removeItem('token')
            set({ currentUserId: null, isAuthenticated: false, isAuthLoading: false, hasHydrated: true })
            return
          }

          const mappedUser = mapAuthUser(data.user)
          mappedUser.profileCompleteness = calcProfileCompleteness(mappedUser)
          mappedUser.trustScore = calcTrustScore(mappedUser, get().ratings)
          mappedUser.trustLevel = calcTrustLevel(mappedUser.trustScore, mappedUser.isSuspended)

          set(state => {
            const existingUserIndex = state.users.findIndex(
              existingUser => existingUser.id === mappedUser.id || existingUser.email === mappedUser.email
            )

            const users = existingUserIndex >= 0
              ? state.users.map((existingUser, index) =>
                  index === existingUserIndex ? { ...existingUser, ...mappedUser } : existingUser
                )
              : [...state.users, mappedUser]

            return {
              users,
              currentUserId: mappedUser.id,
              isAuthenticated: true,
              isAuthLoading: false,
              hasHydrated: true,
            }
          })
        } catch (_error) {
          localStorage.removeItem('token')
          set({ currentUserId: null, isAuthenticated: false, isAuthLoading: false, hasHydrated: true })
        }
      },

      logout: () => {
        localStorage.removeItem('token')
        set({ currentUserId: null, isAuthenticated: false })
      },

      setHasHydrated: (value) => set({ hasHydrated: value }),

      // Products

      // Swaps

      // Messages

      // Ratings

      // Reports and disputes

      // Coins

      // Users

      refreshWallet: async () => {
        const token = localStorage.getItem('token')
        const currentUserId = get().currentUserId

        if (!token || !currentUserId) return

        const res = await fetch(`${API_BASE_URL}/users/me/wallet`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        let data: { wallet?: WalletSummary } | null = null
        try {
          data = await res.json()
        } catch {
          data = null
        }

        if (!res.ok || !data?.wallet) {
          if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('token')
            set({ currentUserId: null, isAuthenticated: false })
          }
          return
        }

        const wallet = data.wallet
        set(state => ({
          users: state.users.map(u =>
            u.id === currentUserId
              ? {
                  ...u,
                  coinBalance: Number(wallet.coins ?? u.coinBalance),
                  heldCoins: Number(wallet.held_coins ?? u.heldCoins ?? 0),
                  totalCoinsEarned: Number(wallet.total_coins_earned ?? u.totalCoinsEarned ?? 0),
                  totalCoinsSpent: Number(wallet.total_coins_spent ?? u.totalCoinsSpent ?? 0),
                  monthlyFreeSwapsUsed: Number(wallet.monthly_free_swaps_used ?? u.monthlyFreeSwapsUsed ?? 0),
                  extraSwapSlots: Number(wallet.extra_swap_slots ?? u.extraSwapSlots ?? 0),
                  priorityMatchesAvailable: Number(wallet.priority_matches_available ?? u.priorityMatchesAvailable ?? 0),
                }
              : u
          ),
        }))
      },

      updateUser: (userId, updates) => {
        set(state => ({
          users: state.users.map(u => {
            if (u.id !== userId) return u
            const merged  = { ...u, ...updates }
            const completeness = calcProfileCompleteness(merged)
            const trustScore   = calcTrustScore(merged, state.ratings)
            return {
              ...merged,
              profileCompleteness: completeness,
              trustScore,
              trustLevel: calcTrustLevel(trustScore, merged.isSuspended ?? false),
            }
          }),
        }))
      },

      // UI

      setSidebarOpen:  (open) => set({ sidebarOpen: open }),
      setMobileNavOpen:(open) => set({ mobileNavOpen: open }),

      // Computed helpers

      getCurrentUser:      () => { const { currentUserId, users } = get(); return currentUserId ? (users.find(u => u.id === currentUserId) ?? null) : null },
      getUserById:         (id) => get().users.find(u => u.id === id),
      getProductById:      (id) => get().products.find(p => p.id === id),
      getSwapById:         (id) => get().swaps.find(s => s.id === id),
      getProductsByUser:   (userId) => get().products.filter(p => p.ownerId === userId),
      getSwapsByUser:      (userId) => get().swaps.filter(s => s.requesterId === userId || s.receiverId === userId),
      getMessagesBySwap:   (swapId) => get().messages.filter(m => m.swapId === swapId),
      getRatingsByUser:    (userId) => get().ratings.filter(r => r.ratedUserId === userId),
      getReports:          () => get().reports,
      getDisputes:         () => get().disputes,
    }),
    {
      name:           'swap-save-store',
      skipHydration:  true,
      version:        1,
      migrate:        (persistedState) => sanitizePersistedAppStore(persistedState),
      partialize:     (state) => ({
        currentUserId:   state.currentUserId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// React provider

const AppContext = createContext<typeof useAppStore | null>(null)

let hasInitializedSession = false

export function AppProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (hasInitializedSession) return
    hasInitializedSession = true

    const initializeSession = async () => {
      await useAppStore.persist.rehydrate()
      await useAppStore.getState().validateStoredSession()
      useAppStore.getState().setHasHydrated(true)
    }

    initializeSession()
  }, [])
  return (
    <AppContext.Provider value={useAppStore}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const store = useContext(AppContext) ?? useAppStore
  return store()
} 
