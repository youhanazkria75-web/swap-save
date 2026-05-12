'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Check, X, ArrowRight, Lock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/form-elements'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'

const PASSWORD_RULES = [
  { id: 'length',  label: 'At least 8 characters',       test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter',         test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'One lowercase letter',         test: (p: string) => /[a-z]/.test(p) },
  { id: 'number',  label: 'One number',                   test: (p: string) => /\d/.test(p) },
  { id: 'special', label: 'One special character (!@#$)', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
]

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const rules = PASSWORD_RULES.map(r => ({ ...r, passed: r.test(form.password) }))
  const strength = rules.filter(r => r.passed).length
  const strengthColor = ['', 'bg-red-500', 'bg-amber-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'][strength]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const e2: Record<string, string> = {}
    if (!token) e2.form = 'Invalid or expired reset link'
    if (strength < PASSWORD_RULES.length) e2.password = 'Password does not meet requirements'
    if (!form.confirm) e2.confirm = 'Please confirm your password'
    else if (form.password !== form.confirm) e2.confirm = 'Passwords do not match'
    setErrors(e2)
    if (Object.keys(e2).length) return

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password: form.password,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrors({ form: data.message || 'Invalid or expired reset link' })
        return
      }

      setDone(true)
      toast.success('Password reset successful')
      setTimeout(() => router.push('/login'), 2000)
    } catch (_error) {
      setErrors({ form: 'Could not reset password. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm mx-auto text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Password reset successful</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Password reset successful. Redirecting you to login...
        </p>
        <Button asChild className="w-full"><Link href="/login">Go to login</Link></Button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-8">
        <div className="flex justify-center mb-5">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center mb-1">Set new password</h1>
        <p className="text-muted-foreground text-sm text-center">
          Choose a strong password for your account.
        </p>
      </div>

      {errors.form && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors(e2 => ({ ...e2, password: '' })) }}
              className={cn('pr-10', errors.password && 'border-destructive')}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}

          {form.password && (
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className={cn('h-1 flex-1 rounded-full transition-all', n <= strength ? strengthColor : 'bg-muted')} />
              ))}
            </div>
          )}

          <div className="space-y-1.5 mt-2">
            {rules.map(r => (
              <div key={r.id} className={cn('flex items-center gap-2 text-xs transition-colors', r.passed ? 'text-green-600' : 'text-muted-foreground')}>
                {r.passed ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
                {r.label}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <div className="relative">
            <Input
              id="confirm"
              type={showConfirm ? 'text' : 'password'}
              value={form.confirm}
              onChange={e => { setForm(f => ({ ...f, confirm: e.target.value })); setErrors(e2 => ({ ...e2, confirm: '' })) }}
              className={cn('pr-10', errors.confirm && 'border-destructive')}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowConfirm(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
          {form.confirm && form.password === form.confirm && !errors.confirm && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Passwords match
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Reset password <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm mx-auto text-center">
        <p className="text-muted-foreground text-sm">Loading reset form...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
