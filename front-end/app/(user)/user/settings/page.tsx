'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  User, Award, Lock, Bell, Save, CheckCircle2,
  Star, AlertTriangle, Trash2, ShieldCheck, Camera,
  Send, Check, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea, Switch } from '@/components/ui/form-elements'
import { Avatar, AvatarFallback, AvatarImage, Tabs, TabsList, TabsTrigger, TabsContent, Progress } from '@/components/ui/primitives'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { TrustBadge } from '@/components/shared/status-badges'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { API_BASE_URL as API_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import egyptLocationsDataset from '@/lib/egypt_locations_english_dropdown_dataset.json'
const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const EGYPT_COUNTRY = 'Egypt'

type EgyptLocationArea = {
  name: string
  meeting_points: string[]
}

type EgyptLocationEntry = {
  governorate: string
  city: string
  areas: EgyptLocationArea[]
}

const EGYPT_LOCATIONS = egyptLocationsDataset as EgyptLocationEntry[]
const CITY_OPTIONS = EGYPT_LOCATIONS.map(location => location.city)

const getEgyptLocation = (city: string) =>
  EGYPT_LOCATIONS.find(location => location.city === city.trim())

const getEgyptAreas = (city: string) => getEgyptLocation(city)?.areas ?? []

const getEgyptArea = (city: string, area: string) =>
  getEgyptAreas(city).find(item => item.name === area.trim())

const normalizeCityValue = (city: string) => getEgyptLocation(city)?.city ?? ''

const normalizeAreaValue = (city: string, area: string) =>
  getEgyptArea(city, area)?.name ?? ''

type NotificationPreferenceKey =
  | 'swap_requests_enabled'
  | 'new_messages_enabled'
  | 'admin_decisions_enabled'
  | 'new_ratings_enabled'
  | 'promotions_enabled'
  | 'weekly_digest_enabled'

type NotificationPreferences = Record<NotificationPreferenceKey, boolean>

type SettingsUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  avatar: string
  phone: string
  bio: string
  country: string
  city: string
  area: string
  streetAddress: string
  role: string
  isEmailVerified: boolean
  isPhoneVerified: boolean
  rating: number
  ratingCount: number
  completedSwaps: number
  trustScore: number
  profileCompleteness: number
  coinBalance: number
  heldCoins: number
  totalCoinsEarned: number
  totalCoinsSpent: number
  monthlyFreeSwapsUsed: number
  extraSwapSlots: number
  priorityMatchesAvailable: number
  phoneVerificationRewardGranted: boolean
  profileCompleteRewardGranted: boolean
  twoFactorEnabled: boolean
  loginAlertsEnabled: boolean
  activeSessionsCount: number
  notificationPreferences: NotificationPreferences
}

type ProfileForm = {
  firstName: string
  lastName: string
  phone: string
  bio: string
  country: string
  city: string
  area: string
  streetAddress: string
}

type PasswordForm = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type SettingsLocationDropdownOption = {
  value: string
  label: string
}

type SettingsLocationDropdownProps = {
  value: string
  options: SettingsLocationDropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

type ApiRecord = Record<string, unknown>

function SettingsLocationDropdown({
  value,
  options,
  onChange,
  disabled = false,
}: SettingsLocationDropdownProps) {
  const selectedOption = options.find(option => option.value === value)
  const selectedLabel = selectedOption?.label || options[0]?.label || 'Select'
  const isPlaceholder = !value

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors',
            'hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
            isPlaceholder && 'text-muted-foreground'
          )}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-modal"
      >
        {options.map(option => {
          const selected = option.value === value

          return (
            <DropdownMenuItem
              key={`${option.value}-${option.label}`}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm',
                selected && 'bg-accent text-accent-foreground'
              )}
              onSelect={() => onChange(option.value)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  swap_requests_enabled: true,
  new_messages_enabled: true,
  admin_decisions_enabled: true,
  new_ratings_enabled: true,
  promotions_enabled: false,
  weekly_digest_enabled: true,
}

const NOTIFICATION_OPTIONS: Array<{
  key: NotificationPreferenceKey
  title: string
  description: string
}> = [
  { key: 'swap_requests_enabled', title: 'Swap requests', description: 'When someone wants to swap with you' },
  { key: 'new_messages_enabled', title: 'New messages', description: 'Messages in your swap discussions' },
  { key: 'admin_decisions_enabled', title: 'Admin decisions', description: 'Approvals and rejections' },
  { key: 'new_ratings_enabled', title: 'New ratings', description: 'When you receive a rating' },
  { key: 'promotions_enabled', title: 'Promotions', description: 'Platform news and offers' },
  { key: 'weekly_digest_enabled', title: 'Weekly digest', description: 'Summary of marketplace activity' },
]

const isRecord = (value: unknown): value is ApiRecord =>
  typeof value === 'object' && value !== null

const getString = (item: ApiRecord, ...keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string') return value
  }

  return ''
}

const getBoolean = (value: unknown) => value === true || value === 'true'

const getNotificationPreferences = (value: unknown): NotificationPreferences => {
  if (!isRecord(value)) return DEFAULT_NOTIFICATION_PREFERENCES

  return NOTIFICATION_OPTIONS.reduce<NotificationPreferences>((preferences, option) => {
    preferences[option.key] = typeof value[option.key] === 'boolean'
      ? value[option.key] as boolean
      : DEFAULT_NOTIFICATION_PREFERENCES[option.key]
    return preferences
  }, { ...DEFAULT_NOTIFICATION_PREFERENCES })
}

const mapUser = (item: ApiRecord): SettingsUser => ({
  id: String(item._id ?? item.id ?? ''),
  firstName: getString(item, 'first_name', 'firstName'),
  lastName: getString(item, 'last_name', 'lastName'),
  email: getString(item, 'email'),
  avatar: getString(item, 'avatar'),
  phone: getString(item, 'phone'),
  bio: getString(item, 'bio'),
  country: getString(item, 'country'),
  city: getString(item, 'city'),
  area: getString(item, 'area'),
  streetAddress: getString(item, 'street_address', 'streetAddress'),
  role: getString(item, 'role') || 'user',
  isEmailVerified: getBoolean(item.isEmailVerified ?? item.is_email_verified),
  isPhoneVerified: getBoolean(item.isPhoneVerified ?? item.is_phone_verified),
  rating: Number(item.rating ?? 0),
  ratingCount: Number(item.rating_count ?? item.ratingCount ?? 0),
  completedSwaps: Number(item.completed_swaps ?? item.completedSwaps ?? 0),
  trustScore: Number(item.trust_score ?? item.trustScore ?? 0),
  profileCompleteness: Number(item.profile_completeness ?? item.profileCompleteness ?? 0),
  coinBalance: Number(item.coin_balance ?? item.coinBalance ?? item.coins ?? 0),
  heldCoins: Number(item.held_coins ?? item.heldCoins ?? 0),
  totalCoinsEarned: Number(item.total_coins_earned ?? item.totalCoinsEarned ?? 0),
  totalCoinsSpent: Number(item.total_coins_spent ?? item.totalCoinsSpent ?? 0),
  monthlyFreeSwapsUsed: Number(item.monthly_free_swaps_used ?? item.monthlyFreeSwapsUsed ?? 0),
  extraSwapSlots: Number(item.extra_swap_slots ?? item.extraSwapSlots ?? 0),
  priorityMatchesAvailable: Number(item.priority_matches_available ?? item.priorityMatchesAvailable ?? 0),
  phoneVerificationRewardGranted: getBoolean(item.phone_verification_reward_granted ?? item.phoneVerificationRewardGranted),
  profileCompleteRewardGranted: getBoolean(item.profile_complete_reward_granted ?? item.profileCompleteRewardGranted),
  twoFactorEnabled: getBoolean(item.two_factor_enabled ?? item.twoFactorEnabled),
  loginAlertsEnabled: getBoolean(item.login_alerts_enabled ?? item.loginAlertsEnabled),
  activeSessionsCount: Number(item.active_sessions_count ?? item.activeSessionsCount ?? 1),
  notificationPreferences: getNotificationPreferences(item.notification_preferences ?? item.notificationPreferences),
})

const getBackendUser = (data: unknown) =>
  isRecord(data) && isRecord(data.user) ? mapUser(data.user) : null

const profileFormFromUser = (user: SettingsUser): ProfileForm => ({
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  bio: user.bio,
  country: EGYPT_COUNTRY,
  city: normalizeCityValue(user.city),
  area: normalizeAreaValue(normalizeCityValue(user.city), user.area),
  streetAddress: user.streetAddress,
})

const getErrorMessage = (data: unknown, fallback: string) =>
  isRecord(data) && typeof data.message === 'string' ? data.message : fallback

export default function SettingsPage() {
  const router = useRouter()
  const { refreshWallet, updateUser } = useApp()
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const [user, setUser] = useState<SettingsUser | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
    country: EGYPT_COUNTRY,
    city: '',
    area: '',
    streetAddress: '',
  })
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
  const [loginAlertsEnabled, setLoginAlertsEnabled] = useState(true)
  const [deletePassword, setDeletePassword] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneCodeSent, setPhoneCodeSent] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [savingSecurity, setSavingSecurity] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)
  const [sendingPhoneCode, setSendingPhoneCode] = useState(false)
  const [verifyingPhone, setVerifyingPhone] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const redirectToLogin = useCallback(() => {
    localStorage.removeItem('token')
    router.push('/login')
  }, [router])

  const requestJson = useCallback(async (path: string, init?: RequestInit) => {
    const token = localStorage.getItem('token') || ''

    if (!token) {
      redirectToLogin()
      throw new Error('Please log in again.')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)

    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    })

    let data: unknown = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        redirectToLogin()
      }

      throw new Error(getErrorMessage(data, 'Request failed.'))
    }

    return data
  }, [redirectToLogin])

  const applyUser = useCallback((nextUser: SettingsUser) => {
    setUser(nextUser)
    setProfileForm(profileFormFromUser(nextUser))
    setNotificationPreferences(nextUser.notificationPreferences)
    setTwoFactorEnabled(nextUser.twoFactorEnabled)
    setLoginAlertsEnabled(nextUser.loginAlertsEnabled)
    updateUser(nextUser.id, {
      firstName: nextUser.firstName,
      lastName: nextUser.lastName,
      phone: nextUser.phone,
      avatar: nextUser.avatar,
      country: nextUser.country,
      city: nextUser.city,
      area: nextUser.area,
      streetAddress: nextUser.streetAddress,
      bio: nextUser.bio,
      isPhoneVerified: nextUser.isPhoneVerified,
      coinBalance: nextUser.coinBalance,
      heldCoins: nextUser.heldCoins,
      totalCoinsEarned: nextUser.totalCoinsEarned,
      totalCoinsSpent: nextUser.totalCoinsSpent,
      monthlyFreeSwapsUsed: nextUser.monthlyFreeSwapsUsed,
      extraSwapSlots: nextUser.extraSwapSlots,
      priorityMatchesAvailable: nextUser.priorityMatchesAvailable,
    })
  }, [updateUser])

  const emitUserUpdated = (nextUser: SettingsUser) => {
    window.dispatchEvent(new CustomEvent('account-profile-updated', {
      detail: {
        id: nextUser.id,
        firstName: nextUser.firstName,
        lastName: nextUser.lastName,
        avatar: nextUser.avatar,
      },
    }))
  }

  useEffect(() => {
    let cancelled = false

    const loadSettings = async () => {
      try {
        setLoading(true)
        const data = await requestJson('/users/me')
        const nextUser = getBackendUser(data)

        if (!nextUser) {
          throw new Error('Could not load your settings.')
        }

        if (!cancelled) {
          applyUser(nextUser)
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load settings.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [applyUser, requestJson])

  const setProfileField = (key: keyof ProfileForm, value: string) => {
    setProfileForm(current => ({ ...current, [key]: value }))
  }

  const setProfileCity = (city: string) => {
    setProfileForm(current => ({
      ...current,
      country: EGYPT_COUNTRY,
      city,
      area: '',
    }))
  }

  const setProfileArea = (area: string) => {
    setProfileForm(current => ({
      ...current,
      country: EGYPT_COUNTRY,
      area,
    }))
  }

  const updateUserFromResponse = (data: unknown, fallback: string) => {
    const nextUser = getBackendUser(data)

    if (!nextUser) {
      throw new Error(fallback)
    }

    applyUser(nextUser)
    return nextUser
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Images only, max 5MB.')
      return
    }

    if (file.size > MAX_AVATAR_SIZE) {
      toast.error('Profile image must be 5MB or smaller.')
      return
    }

    const formData = new FormData()
    formData.append('avatar', file)

    try {
      setSavingAvatar(true)
      const data = await requestJson('/users/me/avatar', {
        method: 'POST',
        body: formData,
      })
      const nextUser = updateUserFromResponse(data, 'Could not update profile image.')
      emitUserUpdated(nextUser)
      toast.success('Profile image updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload profile image.')
    } finally {
      setSavingAvatar(false)
    }
  }

  const handleSaveProfile = async () => {
    const firstName = profileForm.firstName.trim()
    const lastName = profileForm.lastName.trim()
    const city = normalizeCityValue(profileForm.city)
    const area = normalizeAreaValue(city, profileForm.area)

    if (!firstName || !lastName) {
      toast.error('First name and last name are required.')
      return
    }

    if (profileForm.country !== EGYPT_COUNTRY) {
      toast.error('Country must be Egypt.')
      return
    }

    if (profileForm.city.trim() && !city) {
      toast.error('Please select a valid city.')
      return
    }

    if (profileForm.area.trim() && !area) {
      toast.error('Please select a valid area.')
      return
    }

    try {
      setSavingProfile(true)
      const data = await requestJson('/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone: profileForm.phone.trim(),
          bio: profileForm.bio.trim(),
          country: EGYPT_COUNTRY,
          city,
          area,
          street_address: profileForm.streetAddress.trim(),
        }),
      })
      const nextUser = updateUserFromResponse(data, 'Could not update your profile.')
      if (nextUser.phone !== user?.phone || !nextUser.isPhoneVerified) {
        setPhoneCode('')
        setPhoneCodeSent(false)
      }
      setEditingProfile(false)
      emitUserUpdated(nextUser)
      toast.success('Profile updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Fill in all password fields.')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New password and confirmation do not match.')
      return
    }

    try {
      setSavingPassword(true)
      await requestJson('/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Password updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update password.')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSendPhoneCode = async () => {
    if (!user?.phone) {
      toast.error('Add a phone number in Profile to verify it.')
      return
    }

    try {
      setSendingPhoneCode(true)
      await requestJson('/users/me/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      setPhoneCodeSent(true)
      setPhoneCode('')
      toast.success('Verification code sent.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send verification code.')
    } finally {
      setSendingPhoneCode(false)
    }
  }

  const handleVerifyPhoneCode = async () => {
    const code = phoneCode.trim()

    if (!code) {
      toast.error('Enter the verification code.')
      return
    }

    try {
      setVerifyingPhone(true)
      const data = await requestJson('/users/me/phone/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      updateUserFromResponse(data, 'Could not verify your phone.')
      setPhoneCode('')
      setPhoneCodeSent(false)
      toast.success('Phone verified successfully.')

      if (isRecord(data) && data.reward_granted === true) {
        toast.success('+10 coins added to your wallet.')
      }

      refreshWallet().catch(() => {})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to verify phone.')
    } finally {
      setVerifyingPhone(false)
    }
  }

  const handleSaveSecurityPreferences = async () => {
    try {
      setSavingSecurity(true)
      const data = await requestJson('/users/me/security-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          two_factor_enabled: twoFactorEnabled,
          login_alerts_enabled: loginAlertsEnabled,
        }),
      })
      updateUserFromResponse(data, 'Could not update security preferences.')
      toast.success('Security preferences updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update security preferences.')
    } finally {
      setSavingSecurity(false)
    }
  }

  const handleSaveNotifications = async () => {
    try {
      setSavingNotifications(true)
      const data = await requestJson('/users/me/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationPreferences),
      })
      updateUserFromResponse(data, 'Could not update notification preferences.')
      toast.success('Notification preferences updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update notification preferences.')
    } finally {
      setSavingNotifications(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!user) return

    if (!deletePassword) {
      toast.error('Enter your password to delete your account.')
      return
    }

    if (!window.confirm('This permanently deletes your account data. Continue?')) {
      return
    }

    try {
      setDeleting(true)
      await requestJson('/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      localStorage.removeItem('token')
      toast.success('Account deleted.')
      router.push('/')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete account.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center text-sm text-muted-foreground">
        Loading settings...
      </div>
    )
  }

  if (!user) {
    return null
  }

  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || 'U'
  const trusted = user.trustScore >= 70
  const trustLevel = user.trustScore >= 70 ? 'trusted' : user.trustScore >= 30 ? 'new' : 'risky'
  const improvementItems = [
    !user.isPhoneVerified ? 'Verify phone (+10 pts)' : '',
    user.profileCompleteness < 80 ? 'Complete profile (+5 pts)' : '',
    user.completedSwaps < 5 ? 'Complete more swaps (+4 pts each)' : '',
    user.ratingCount === 0 ? 'Earn ratings from completed swaps' : '',
  ].filter(Boolean)
  const profileAreaOptions = getEgyptAreas(profileForm.city)
  const countryOptions = [{ value: EGYPT_COUNTRY, label: EGYPT_COUNTRY }]
  const cityOptions = [
    { value: '', label: 'Select city...' },
    ...CITY_OPTIONS.map(city => ({ value: city, label: city })),
  ]
  const areaOptions = [
    { value: '', label: profileForm.city ? 'Select area...' : 'Select city first' },
    ...profileAreaOptions.map(area => ({ value: area.name, label: area.name })),
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile & Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account details and preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-1.5" />Profile</TabsTrigger>
          <TabsTrigger value="security"><Lock className="h-4 w-4 mr-1.5" />Security</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1.5" />Notifications</TabsTrigger>
          <TabsTrigger value="trust"><Award className="h-4 w-4 mr-1.5" />Trust</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5 space-y-5">
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="relative h-20 w-20 shrink-0">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="text-xl font-bold bg-brand-100 text-brand-700">{initials}</AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  disabled={savingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
                  aria-label="Upload profile image"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-lg">{user.firstName} {user.lastName}</p>
                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role === 'admin' ? 'Admin' : 'User'}</Badge>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Profile completeness</span>
                    <span className="font-medium">{user.profileCompleteness}%</span>
                  </div>
                  <Progress value={user.profileCompleteness} className="h-1.5 max-w-xs" />
                </div>
              </div>
              <div className="hidden">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Personal information</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={profileForm.firstName} disabled={!editingProfile} onChange={e => setProfileField('firstName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={profileForm.lastName} disabled={!editingProfile} onChange={e => setProfileField('lastName', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-muted-foreground font-normal">(cannot change)</span></Label>
              <div className="flex items-center gap-2">
                <Input value={user.email} disabled className="flex-1 opacity-60" />
                <Badge variant={user.isEmailVerified ? 'default' : 'secondary'}>
                  {user.isEmailVerified ? 'Verified' : 'Not verified'}
                </Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <div className="flex items-center gap-2">
                <Input value={profileForm.phone} disabled={!editingProfile} onChange={e => setProfileField('phone', e.target.value)} placeholder="+20..." />
                <Badge variant={user.isPhoneVerified ? 'default' : 'secondary'} className="shrink-0">
                  {user.isPhoneVerified ? 'Verified' : 'Not verified'}
                </Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bio</Label>
              <Textarea value={profileForm.bio} disabled={!editingProfile} onChange={e => setProfileField('bio', e.target.value)} rows={4} placeholder="Tell other swappers a little about yourself" />
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Location</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Country</Label>
                <SettingsLocationDropdown
                  value={profileForm.country || EGYPT_COUNTRY}
                  disabled
                  options={countryOptions}
                  onChange={() => undefined}
                />
              </div>

              <div className="space-y-1.5">
                <Label>City</Label>
                <SettingsLocationDropdown
                  value={profileForm.city}
                  disabled={!editingProfile}
                  options={cityOptions}
                  onChange={setProfileCity}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Area</Label>
                <SettingsLocationDropdown
                  value={profileForm.area}
                  disabled={!editingProfile || !profileForm.city}
                  options={areaOptions}
                  onChange={setProfileArea}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Street address <span className="text-muted-foreground font-normal">(private)</span></Label>
              <Input value={profileForm.streetAddress} disabled={!editingProfile} onChange={e => setProfileField('streetAddress', e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (!editingProfile) {
                  setEditingProfile(true)
                  return
                }

                handleSaveProfile()
              }}
              loading={savingProfile}
              size="lg"
            >
              {editingProfile && <Save className="h-4 w-4" />}
              {editingProfile ? 'Save changes' : 'Edit profile'}
            </Button>
            {editingProfile && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setProfileForm(profileFormFromUser(user))
                  setEditingProfile(false)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-5 space-y-5">
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-semibold mb-4">Account security</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium">Email verification</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant={user.isEmailVerified ? 'default' : 'secondary'}>
                  {user.isEmailVerified ? 'Verified' : 'Not verified'}
                </Badge>
              </div>
              <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Phone verification</p>
                  <p className="text-xs text-muted-foreground">
                    {user.phone || 'Add a phone number in Profile to verify it.'}
                  </p>
                </div>
                {user.phone && user.isPhoneVerified ? (
                  <Badge className="bg-green-600 text-white hover:bg-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verified
                  </Badge>
                ) : user.phone ? (
                  <div className="flex w-full flex-col items-stretch gap-2 sm:w-[270px]">
                    <Button
                      type="button"
                      variant={phoneCodeSent ? 'outline' : 'default'}
                      onClick={handleSendPhoneCode}
                      loading={sendingPhoneCode}
                      disabled={verifyingPhone}
                    >
                      <Send className="h-4 w-4" /> {phoneCodeSent ? 'Resend code' : 'Send verification code'}
                    </Button>
                    {phoneCodeSent && (
                      <div className="flex flex-col gap-2">
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={phoneCode}
                          onChange={event => setPhoneCode(event.target.value)}
                          placeholder="123456"
                          disabled={verifyingPhone}
                        />
                        <Button
                          type="button"
                          onClick={handleVerifyPhoneCode}
                          loading={verifyingPhone}
                          disabled={sendingPhoneCode}
                        >
                          <ShieldCheck className="h-4 w-4" /> Verify phone
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <div>
                  <p className="text-sm font-medium">Current session</p>
                  <p className="text-xs text-muted-foreground">This browser session</p>
                </div>
                <Badge variant="secondary">{user.activeSessionsCount} active session{user.activeSessionsCount === 1 ? '' : 's'}</Badge>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Change password</h2>
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>New password</Label>
                <Input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm new password</Label>
                <Input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} />
              </div>
            </div>
            <Button onClick={handleChangePassword} loading={savingPassword}>
              Update password
            </Button>
          </div>

          <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Security options</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Two-factor authentication</p>
                  <p className="text-xs text-muted-foreground">Stored preference for future login challenges</p>
                </div>
                <Switch checked={twoFactorEnabled} onCheckedChange={setTwoFactorEnabled} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Login alerts</p>
                  <p className="text-xs text-muted-foreground">Receive account login notifications when available</p>
                </div>
                <Switch checked={loginAlertsEnabled} onCheckedChange={setLoginAlertsEnabled} />
              </div>
            </div>
            <Button onClick={handleSaveSecurityPreferences} loading={savingSecurity} variant="outline">
              Save security options
            </Button>
          </div>

          <div className="bg-card rounded-2xl border border-destructive/30 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Danger zone
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Permanently delete your account and all data.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Password confirmation</Label>
              <Input type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Enter your password" />
            </div>
            <Button variant="destructive" onClick={handleDeleteAccount} loading={deleting}>
              <Trash2 className="h-4 w-4" /> Delete account
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="mt-5">
          <div className="bg-card rounded-2xl border border-border p-5 space-y-5">
            <div>
              <h2 className="font-semibold">Notification preferences</h2>
              <p className="text-sm text-muted-foreground">Choose which account notifications you want to receive.</p>
            </div>
            <div className="space-y-4">
              {NOTIFICATION_OPTIONS.map(option => (
                <div key={option.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{option.title}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                  <Switch
                    checked={notificationPreferences[option.key]}
                    onCheckedChange={checked => setNotificationPreferences(current => ({ ...current, [option.key]: checked }))}
                  />
                </div>
              ))}
            </div>
            <Button onClick={handleSaveNotifications} loading={savingNotifications}>
              <Save className="h-4 w-4" /> Save notification preferences
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="trust" className="mt-5 space-y-5">
          <div className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Trust score</h2>
                <div className="mt-2 flex">
                  <TrustBadge level={trustLevel} />
                </div>
              </div>
              <Badge variant={trusted ? 'default' : 'secondary'}>
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> {user.trustScore}/100
              </Badge>
            </div>
            <Progress value={user.trustScore} className="h-3" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: 'Completed swaps', value: user.completedSwaps },
              { label: 'Average rating', value: user.ratingCount > 0 ? `${user.rating.toFixed(1)} ★` : 'No ratings' },
              { label: 'Email verified', value: user.isEmailVerified ? 'Yes' : 'No' },
              { label: 'Phone verified', value: user.isPhoneVerified ? 'Yes' : 'No' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold mt-1 flex items-center gap-1">
                  {value}
                  {label === 'Average rating' && user.ratingCount > 0 && <Star className="h-4 w-4 fill-amber-400 text-amber-400" />}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-semibold mb-3">Improve your score</h2>
            {improvementItems.length > 0 ? (
              <div className="space-y-2">
                {improvementItems.map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Your trust fundamentals are in good shape.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
