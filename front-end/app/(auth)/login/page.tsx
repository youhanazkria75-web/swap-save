'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/form-elements'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api-config'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthLoading } = useApp()
  const backendUrl = API_BASE_URL

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.email.trim()) e.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Please enter a valid email'
    if (!form.password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const result = await login(form.email, form.password)
    if (result.success) {
      toast.success('Welcome back!')
      router.push(result.user?.isAdmin ? '/admin' : '/user/dashboard')
    } else {
      setErrors({ form: result.error || 'Login failed' })
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
        <p className="text-muted-foreground text-sm">
          Don't have an account?{' '}
          <Link href="/signup" className="text-primary font-medium hover:underline">Sign up free</Link>
        </p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or login with credentials</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Form error */}
      {errors.form && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@email.com"
            value={form.email}
            onChange={e => {
              setForm(f => ({ ...f, email: e.target.value }))
              if (errors.email) setErrors(er => ({ ...er, email: '' }))
            }}
            className={cn(errors.email && 'border-destructive focus-visible:ring-destructive')}
          />
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={form.password}
              onChange={e => {
                setForm(f => ({ ...f, password: e.target.value }))
                if (errors.password) setErrors(er => ({ ...er, password: '' }))
              }}
              className={cn('pr-10', errors.password && 'border-destructive focus-visible:ring-destructive')}
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
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isAuthLoading}>
          Log in <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {/* Google */}
      <div className="mt-4">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => { window.location.href = `${backendUrl}/auth/google?source=login` }}
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

      <p className="text-center text-xs text-muted-foreground mt-6">
        Protected by admin oversight & 2FA support
      </p>
    </div>
  )
}
