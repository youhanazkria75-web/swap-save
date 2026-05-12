'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { useApp } from '@/contexts/app-context'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAuthenticated, hasHydrated, getCurrentUser } = useApp()
  const isSignupPage = pathname === '/signup'
  const user = getCurrentUser()

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !user) return
    if (pathname === '/login' || pathname === '/signup') {
      router.replace(user.isAdmin ? '/admin' : '/user/dashboard')
    }
  }, [hasHydrated, isAuthenticated, pathname, router, user])

  const hero = isSignupPage
    ? {
        title: 'Start your sustainable journey today.',
        description: 'Create an account to list products, discover perfect matches, and join our community of smart swappers.',
        bullets: [
          'AI-powered swap recommendations',
          'Secure admin-verified transactions',
          'Free to join, free to swap',
        ],
        footnote: '',
      }
    : {
        title: 'Welcome back to the smartest way to exchange.',
        description: 'Sign in to continue swapping products, managing your listings, and discovering AI-powered matches.',
        bullets: [],
        footnote: 'Join 50,000+ users who trust Swap & Save',
      }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-brand-950 via-teal-900 to-brand-900 text-white relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />

        <Link href="/" className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <ArrowLeftRight className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-xl">Swap & Save</span>
        </Link>

        <div className="relative space-y-6">
          <div className="space-y-4 max-w-xl">
            <h1 className="text-4xl font-bold leading-tight">{hero.title}</h1>
            <p className="text-lg leading-relaxed text-white/80">{hero.description}</p>
          </div>

          {hero.bullets.length > 0 && (
            <div className="space-y-3 border-t border-white/15 pt-6">
              {hero.bullets.map((bullet) => (
                <div key={bullet} className="flex items-center gap-3 text-white/90">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <p className="text-sm font-medium">{bullet}</p>
                </div>
              ))}
            </div>
          )}

          {hero.footnote && (
            <p className="border-t border-white/15 pt-6 text-sm text-white/75">
              {hero.footnote}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col min-h-screen lg:min-h-0">
        <div className="flex items-center justify-between p-6 lg:hidden border-b border-border">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
              <ArrowLeftRight className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg">
              Swap<span className="gradient-text">&Save</span>
            </span>
          </Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Back to site</Link>
        </div>

        <div className="flex flex-1 flex-col justify-center px-6 py-10 lg:px-12 xl:px-16">
          {children}
        </div>

        <div className="p-6 text-center text-xs text-muted-foreground border-t border-border lg:border-0">
          By continuing you agree to our{' '}
          <Link href="/terms" className="hover:text-foreground underline">Terms</Link>
          {' & '}
          <Link href="/privacy" className="hover:text-foreground underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
