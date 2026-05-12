'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Mail, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/contexts/app-context'
import { API_BASE_URL } from '@/lib/api-config'

type Status = 'loading' | 'success' | 'error'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { completeEmailVerification } = useApp()
  const [status, setStatus] = useState<Status>('loading')
  const [message, setMessage] = useState('Verifying your email...')
  const verifiedTokenRef = useRef<string | null>(null)
  const requestedTokenRef = useRef<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setStatus('error')
      setMessage('Invalid or expired verification link')
      return
    }

    if (requestedTokenRef.current === token || verifiedTokenRef.current === token) {
      return
    }

    requestedTokenRef.current = token

    const verifyEmail = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`)
        const data = await res.json()

        if (verifiedTokenRef.current === token) {
          return
        }

        if (!res.ok) {
          setStatus('error')
          setMessage('Invalid or expired verification link')
          return
        }

        verifiedTokenRef.current = token
        completeEmailVerification({ token: data.token, user: data.user })
        setStatus('success')
        setMessage('Email verified successfully')
        router.replace(data.user.role === 'admin' ? '/admin' : '/user/dashboard')
      } catch (_error) {
        if (verifiedTokenRef.current === token) {
          return
        }

        setStatus('error')
        setMessage('Invalid or expired verification link')
      }
    }

    verifyEmail()
  }, [completeEmailVerification, router, searchParams])

  const isSuccess = status === 'success'
  const isError = status === 'error'

  return (
    <div className="w-full max-w-sm mx-auto text-center">
      <div className="flex justify-center mb-5">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
          {isSuccess ? (
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          ) : isError ? (
            <XCircle className="h-8 w-8 text-destructive" />
          ) : (
            <Mail className="h-8 w-8 text-primary animate-pulse" />
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-2">
        {isSuccess ? 'Email verified!' : isError ? 'Verification failed' : 'Verifying email'}
      </h1>
      <p className="text-muted-foreground text-sm mb-6">{message}</p>

      {isSuccess ? null : isError ? (
        <div className="space-y-3">
          <Link href="/signup">
            <Button className="w-full" size="lg" variant="outline">
              Back to signup
            </Button>
          </Link>
          <Link href="/login" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
            Back to login
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-sm mx-auto text-center">
        <p className="text-muted-foreground text-sm">Loading verification...</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
