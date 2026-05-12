import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that require authentication
const PROTECTED_PREFIXES = ['/user/', '/user']

// Routes that require admin
const ADMIN_PREFIXES = ['/admin']

// Auth pages — redirect to dashboard if already logged in
const AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // We use client-side auth guards in layouts for dynamic state.
  // This middleware handles static redirects and security headers only.

  // Add security headers
  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
