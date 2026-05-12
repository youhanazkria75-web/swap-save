'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/contexts/app-context'
import { toast } from 'sonner'

function decodeGooglePayload(data: string) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

function GoogleCallbackLoading() {
  return (
    <div className="w-full max-w-sm mx-auto text-center">
      <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
      <h1 className="text-xl font-semibold mb-2">Completing Google sign-in</h1>
      <p className="text-sm text-muted-foreground">Please wait while we finish signing you in.</p>
    </div>
  )
}

function GoogleCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { completeEmailVerification } = useApp()
  const handledRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true

    const errorMessage = searchParams.get('error')
    const data = searchParams.get('data')

    if (errorMessage) {
      setError(errorMessage)
      toast.error(errorMessage)
      return
    }

    if (!data) {
      setError('Google authentication response is missing.')
      return
    }

    let payload

    try {
      payload = decodeGooglePayload(data)
    } catch (decodeError) {
      console.error('Google callback payload decode failed:', decodeError)
      setError('Invalid Google callback payload')
      return
    }

    try {
      if (!payload.token || !payload.user) {
        setError('Google authentication response is invalid.')
        return
      }

      completeEmailVerification({ token: payload.token, user: payload.user })
      toast.success('Signed in with Google')
      router.replace(payload.user.role === 'admin' ? '/admin' : '/user/dashboard')
    } catch (callbackError) {
      console.error('Google callback completion failed:', callbackError)
      setError(callbackError instanceof Error ? callbackError.message : 'Could not complete Google authentication.')
    }
  }, [completeEmailVerification, router, searchParams])

  if (error) {
    return (
      <div className="w-full max-w-sm mx-auto text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Google sign-in failed</h1>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Button asChild className="w-full">
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    )
  }

  return <GoogleCallbackLoading />
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<GoogleCallbackLoading />}>
      <GoogleCallbackContent />
    </Suspense>
  )
}
