'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/form-elements'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api-config'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const requestResetLink = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Please enter a valid email'); return }
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.message || 'Could not send reset link')
        return
      }

      setSent(true)
      toast.success('If an account exists for this email, a password reset link has been sent.')
    } catch (_error) {
      setError('Could not send reset link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await requestResetLink()
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm mx-auto text-center">
        <div className="flex justify-center mb-5">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your inbox</h1>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          If an account exists for <strong>{email}</strong>, a password reset link has been sent.
          Check your inbox and spam folder for next steps.
        </p>
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setSent(false); setEmail('') }}
          >
            Try a different email
          </Button>
          <p className="text-xs text-muted-foreground">
            Didn't receive it?{' '}
            <button
              className="text-primary hover:underline"
              onClick={requestResetLink}
            >
              Resend
            </button>
          </p>
          <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-8">
        <Link href="/login" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </Link>
        <h1 className="text-2xl font-bold mb-1">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          No worries. Enter your email and we'll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              className={`pl-10 ${error ? 'border-destructive' : ''}`}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send reset link <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Remember your password?{' '}
        <Link href="/login" className="text-primary hover:underline">Log in</Link>
      </p>
    </div>
  )
}
