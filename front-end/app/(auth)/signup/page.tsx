'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Eye, EyeOff, Check, X, ArrowRight, ArrowLeft,
  CheckCircle2, Mail, Smartphone, MapPin, User as UserIcon,
  Lock, Gift, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Checkbox } from '@/components/ui/form-elements'
import { Progress } from '@/components/ui/primitives'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'
import egyptLocationsDataset from '@/lib/egypt_locations_english_dropdown_dataset.json'

// Password rule checker

const PASSWORD_RULES = [
  { id: 'length',    label: 'At least 8 characters',      test: (p: string) => p.length >= 8 },
  { id: 'upper',     label: 'One uppercase letter',        test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',     label: 'One lowercase letter',        test: (p: string) => /[a-z]/.test(p) },
  { id: 'number',    label: 'One number',                  test: (p: string) => /\d/.test(p) },
  { id: 'special',   label: 'One special character (!@#$)', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
]

const STEPS = [
  { id: 1, label: 'Personal info',  icon: UserIcon },
  { id: 2, label: 'Location',       icon: MapPin },
  { id: 3, label: 'Password',       icon: Lock },
  { id: 4, label: 'Verify',         icon: CheckCircle2 },
]

const EGYPTIAN_MOBILE_REGEX = /^01\d{9}$/
const EGYPT_COUNTRY = 'Egypt'

type EgyptLocationArea = { name: string; meeting_points?: string[] }
type EgyptLocationEntry = { governorate: string; city: string; areas: EgyptLocationArea[] }
type LocationDropdownOption = { value: string; label: string }

const EGYPT_LOCATIONS = egyptLocationsDataset as EgyptLocationEntry[]
const CITY_DROPDOWN_OPTIONS = EGYPT_LOCATIONS.map(location => ({
  value: location.city,
  label: location.city,
}))

const getEgyptLocation = (city: string) =>
  EGYPT_LOCATIONS.find(location => location.city === city.trim())

const getEgyptAreas = (city: string) => getEgyptLocation(city)?.areas ?? []

const getEgyptArea = (city: string, area: string) =>
  getEgyptAreas(city).find(item => item.name === area.trim())

const normalizeCityValue = (city: string) => getEgyptLocation(city)?.city ?? ''

const normalizeAreaValue = (city: string, area: string) =>
  getEgyptArea(city, area)?.name ?? ''

function SignupLocationDropdown({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  hasError = false,
}: {
  id: string
  value: string
  options: LocationDropdownOption[]
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  hasError?: boolean
}) {
  const selectedOption = options.find(option => option.value === value)
  const selectedLabel = selectedOption?.label || placeholder
  const isPlaceholder = !selectedOption
  const isDisabled = disabled || options.length === 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isDisabled}>
        <button
          id={id}
          type="button"
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors',
            'hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
            isPlaceholder && 'text-muted-foreground',
            hasError && 'border-destructive focus:ring-destructive'
          )}
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
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

export default function SignupPage() {
  const { signup, isAuthLoading } = useApp()
  const backendUrl = API_BASE_URL

  const [step, setStep] = useState(1)
  const [verificationEmailSent, setVerificationEmailSent] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    country: EGYPT_COUNTRY, city: '', area: '', streetAddress: '',
    password: '', confirmPassword: '', agreeToTerms: false,
  })

  const set = (k: keyof typeof form, v: any) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const areaDropdownOptions = getEgyptAreas(form.city).map(area => ({
    value: area.name,
    label: area.name,
  }))

  const setCity = (value: string) => {
    const city = normalizeCityValue(value)
    setForm(f => ({ ...f, country: EGYPT_COUNTRY, city, area: '' }))
    setErrors(e => ({ ...e, country: '', city: '', area: '' }))
  }

  const setArea = (value: string) => {
    const area = normalizeAreaValue(form.city, value)
    setForm(f => ({ ...f, country: EGYPT_COUNTRY, area }))
    setErrors(e => ({ ...e, country: '', area: '' }))
  }

  const passwordRules = PASSWORD_RULES.map(r => ({ ...r, passed: r.test(form.password) }))
  const passwordStrength = passwordRules.filter(r => r.passed).length
  const passwordStrengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Perfect'][passwordStrength]
  const passwordStrengthColor = ['', 'bg-red-500', 'bg-amber-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'][passwordStrength]

  const validateStep = (s: number) => {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (!form.firstName.trim()) e.firstName = 'Required'
      if (!form.lastName.trim()) e.lastName = 'Required'
      if (!form.email.trim()) e.email = 'Required'
      else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email address'
      if (!form.phone.trim()) e.phone = 'Required'
      else if (!EGYPTIAN_MOBILE_REGEX.test(form.phone)) e.phone = 'Phone number must be a valid 11-digit Egyptian mobile number'
    }
    if (s === 2) {
      const city = normalizeCityValue(form.city)
      const area = normalizeAreaValue(city, form.area)

      if (form.country !== EGYPT_COUNTRY) e.country = 'Country must be Egypt'
      if (!city) e.city = 'City is required'
      if (!area) e.area = 'Area is required'
    }
    if (s === 3) {
      if (!form.password) e.password = 'Required'
      else if (passwordStrength < PASSWORD_RULES.length) e.password = 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character'
      if (!form.confirmPassword) e.confirmPassword = 'Please confirm your password'
      else if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
      if (!form.agreeToTerms) e.agreeToTerms = 'You must agree to the terms'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const nextStep = () => {
    if (validateStep(step)) setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    const city = normalizeCityValue(form.city)
    const area = normalizeAreaValue(city, form.area)

    const result = await signup({
      firstName: form.firstName, lastName: form.lastName,
      email: form.email, phone: form.phone,
      country: EGYPT_COUNTRY, city, area,
      streetAddress: form.streetAddress,
      password: form.password,
    })
    if (result.success) {
      setVerificationEmailSent(true)
      toast.success('Account created!', { description: 'Check your inbox to verify your email.' })
    } else {
      toast.error(result.error || 'Signup failed')
      setStep(1)
    }
  }

  const resendVerificationEmail = async () => {
    if (!form.email) return
    setResendLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-verification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: form.email }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || 'Could not resend verification email')
        return
      }

      toast.success('Verification email sent')
    } catch (_error) {
      toast.error('Could not resend verification email. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Create your account</h1>
        <p className="text-muted-foreground text-sm">
          Already have one?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">Log in</Link>
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 flex-1">
              <div className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-all',
                step > s.id
                  ? 'bg-primary text-primary-foreground'
                  : step === s.id
                  ? 'bg-primary/15 text-primary border-2 border-primary'
                  : 'bg-muted text-muted-foreground'
              )}>
                {step > s.id ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <span className={cn(
                'hidden sm:block text-xs font-medium ml-1.5',
                step === s.id ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-px mx-2 transition-colors', step > s.id ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: Personal info */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name *</Label>
              <Input
                id="firstName" value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                placeholder="Alex"
                className={cn(errors.firstName && 'border-destructive')}
              />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name *</Label>
              <Input
                id="lastName" value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                placeholder="Morgan"
                className={cn(errors.lastName && 'border-destructive')}
              />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address *</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email" type="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="you@email.com"
                className={cn('pl-10', errors.email && 'border-destructive')}
              />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number *</Label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone" type="tel" value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder="+20 100 000 0000"
                className={cn('pl-10', errors.phone && 'border-destructive')}
              />
            </div>
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>

          {/* Welcome bonus note */}
          <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <Gift className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>50 welcome coins</strong> added to your account on signup!
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={nextStep}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>

          {/* Google option */}
          <Button
            variant="outline" className="w-full gap-2"
            onClick={() => { window.location.href = `${backendUrl}/auth/google?source=signup` }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>
        </div>
      )}

      {/* STEP 2: Location */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="space-y-1.5">
            <Label htmlFor="country">Country *</Label>
            <Input
              id="country"
              value={EGYPT_COUNTRY}
              readOnly
              aria-readonly="true"
              className={cn(
                'cursor-default bg-muted/50',
                errors.country && 'border-destructive'
              )}
            />
            {errors.country && <p className="text-xs text-destructive">{errors.country}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">City *</Label>
            <SignupLocationDropdown
              id="city"
              value={form.city}
              options={CITY_DROPDOWN_OPTIONS}
              onChange={setCity}
              placeholder="Select city"
              hasError={!!errors.city}
            />
            {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="area">Area *</Label>
            <SignupLocationDropdown
              id="area"
              value={form.area}
              options={areaDropdownOptions}
              onChange={setArea}
              placeholder={form.city ? 'Select area' : 'Select city first'}
              disabled={!form.city}
              hasError={!!errors.area}
            />
            {errors.area && <p className="text-xs text-destructive">{errors.area}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="streetAddress">Street address <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="streetAddress" value={form.streetAddress}
              onChange={e => set('streetAddress', e.target.value)}
              placeholder="123 Main St, District..."
            />
            <p className="text-xs text-muted-foreground">
              Only used to suggest nearby meetup points. Never shown publicly.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button className="flex-1" onClick={nextStep}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Password */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <div className="space-y-1.5">
            <Label htmlFor="password">Create password *</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder="Create a strong password"
                className={cn('pr-10', errors.password && 'border-destructive')}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}

            {/* Strength bar */}
            {form.password && (
              <div className="space-y-1.5 mt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Password strength</span>
                  <span className={cn('font-medium', {
                    'text-red-500': passwordStrength <= 1,
                    'text-amber-500': passwordStrength === 2,
                    'text-yellow-500': passwordStrength === 3,
                    'text-blue-500': passwordStrength === 4,
                    'text-green-500': passwordStrength === 5,
                  })}>
                    {passwordStrengthLabel}
                  </span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <div
                      key={n}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-all',
                        n <= passwordStrength ? passwordStrengthColor : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Live rule checklist */}
            <div className="mt-3 space-y-1.5">
              {passwordRules.map(rule => (
                <div key={rule.id} className={cn('flex items-center gap-2 text-xs transition-colors', rule.passed ? 'text-green-600' : 'text-muted-foreground')}>
                  {rule.passed
                    ? <Check className="h-3.5 w-3.5 shrink-0" />
                    : <X className="h-3.5 w-3.5 shrink-0" />}
                  {rule.label}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password *</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={e => set('confirmPassword', e.target.value)}
                placeholder="Repeat your password"
                className={cn('pr-10', errors.confirmPassword && 'border-destructive')}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
            {form.confirmPassword && form.password === form.confirmPassword && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Passwords match
              </p>
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="terms"
              checked={form.agreeToTerms}
              onCheckedChange={v => set('agreeToTerms', !!v)}
              className="mt-0.5"
            />
            <label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="text-primary hover:underline">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>
            </label>
          </div>
          {errors.agreeToTerms && <p className="text-xs text-destructive">{errors.agreeToTerms}</p>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button className="flex-1" onClick={nextStep}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: Verify */}
      {step === 4 && (
        <div className="space-y-5 animate-fade-in">
          <div className="text-center py-4">
            <div className={cn(
              'h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-all',
              verificationEmailSent ? 'bg-green-100' : 'bg-primary/10'
            )}>
              {verificationEmailSent
                ? <CheckCircle2 className="h-8 w-8 text-green-600" />
                : <Mail className="h-8 w-8 text-primary" />
              }
            </div>
            <h2 className="text-lg font-bold mb-1">
              {verificationEmailSent ? 'Check your inbox' : 'Verify your email'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {verificationEmailSent
                ? `We sent a verification link to ${form.email}`
                : 'Create your account and we will email you a verification link.'}
            </p>
          </div>

          {/* Email verification */}
          <div className={cn(
            'p-4 rounded-xl border transition-all',
            verificationEmailSent ? 'border-green-200 bg-green-50' : 'border-border bg-muted/50'
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className={cn('h-5 w-5', verificationEmailSent ? 'text-green-600' : 'text-muted-foreground')} />
                <div>
                  <p className="text-sm font-medium">Email address</p>
                  <p className="text-xs text-muted-foreground">{form.email}</p>
                </div>
              </div>
              {verificationEmailSent ? (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <Check className="h-3.5 w-3.5" /> Sent
                </span>
              ) : null}
            </div>
          </div>

          {/* Phone - optional */}
          <div className="p-4 rounded-xl border border-border bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Phone number</p>
                  <p className="text-xs text-muted-foreground">{form.phone} - Optional now</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => toast.info('Phone verification coming soon')}>
                Skip
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 rounded-xl bg-muted/50 border border-border text-sm space-y-2">
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-3">Account summary</p>
            {[
              { label: 'Name', value: `${form.firstName} ${form.lastName}` },
              { label: 'Location', value: `${form.city}, ${form.country}` },
              { label: 'Welcome coins', value: '50 coins' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep(3)} disabled={verificationEmailSent}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              loading={isAuthLoading}
              disabled={verificationEmailSent}
            >
              {verificationEmailSent ? 'Email sent' : 'Create account'} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {verificationEmailSent && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-muted-foreground">
                Open the link in your email to activate your account.
              </p>
              <button
                type="button"
                onClick={resendVerificationEmail}
                disabled={resendLoading}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {resendLoading ? 'Sending...' : 'Resend verification email'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
