'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeftRight, Facebook, Instagram, Twitter } from 'lucide-react'

type FooterLink = {
  label: string
  href?: string
  authHref?: string
  guestHref?: string
}

const FOOTER_LINKS: Record<string, FooterLink[]> = {
  Platform: [
    { label: 'Browse Marketplace', href: '/marketplace' },
    { label: 'Categories', href: '/categories' },
    { label: 'How It Works', href: '/about#swap-journey' },
    { label: 'AI Matching', href: '/about#ai-matching' },
    { label: 'Trust & Safety', href: '/about#trust-safety' },
    { label: 'Pricing / Coins', authHref: '/user/coins', guestHref: '/login?next=/user/coins' },
  ],
  Support: [
    { label: 'Help Center', href: '/help' },
    { label: 'FAQs', href: '/help#faq' },
    { label: 'Contact Us', href: '/contact' },
    { label: 'Report an Issue', href: '/contact?type=report' },
    { label: 'Dispute Resolution', href: '/help#dispute-resolution' },
  ],
  Legal: [
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Cookie Policy', href: '#footer' },
    { label: 'Community Guidelines', href: '#footer' },
  ],
}

const SOCIAL_LINKS = [
  { icon: Twitter, label: 'X/Twitter', className: 'hover:text-sky-500' },
  { icon: Instagram, label: 'Instagram', className: 'hover:text-pink-500' },
  { icon: Facebook, label: 'Facebook', className: 'hover:text-blue-600' },
]

const FEATURE_BADGES = [
  { icon: '\u{1F510}', label: 'Verified Users' },
  { icon: '\u{1F916}', label: 'AI Matching' },
  { icon: '\u26A1', label: 'Fast Swaps' },
  { icon: '\u{1F6E1}\uFE0F', label: 'Admin Protected' },
]

export function Footer() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    setIsLoggedIn(Boolean(localStorage.getItem('token')))
  }, [])

  const getFooterHref = (link: FooterLink) => {
    if (link.authHref || link.guestHref) {
      return isLoggedIn ? link.authHref || link.href || '#footer' : link.guestHref || link.href || '#footer'
    }

    return link.href || '#footer'
  }

  return (
    <footer id="footer" className="border-t border-border bg-muted/30 mt-auto">
      <div className="page-container py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-teal-600">
                <ArrowLeftRight className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">
                Swap<span className="gradient-text">&Save</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              The smart, admin-controlled product exchange marketplace. Trade what you have
              for what you want &mdash; safely, transparently, and without cash.
            </p>

            {/* Trust pills */}
            <div className="flex flex-wrap gap-2 mt-5">
              {FEATURE_BADGES.map(badge => (
                <span key={badge.label} className="text-xs text-foreground/80 bg-background px-2.5 py-1 rounded-full border border-border shadow-sm">
                  <span aria-hidden="true">{badge.icon}</span> {badge.label}
                </span>
              ))}
            </div>

            {/* Social */}
            <div className="flex items-center gap-2 mt-6">
              {SOCIAL_LINKS.map(({ icon: Icon, label, className }) => (
                <a
                  key={label}
                  href="#footer"
                  aria-label={label}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-foreground/20 hover:bg-muted transition-colors ${className}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-semibold mb-4">{title}</h3>
              <ul className="space-y-2.5">
                {links.map(link => (
                  <li key={link.label}>
                    <Link
                      href={getFooterHref(link)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            &copy; 2026 Swap & Save. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="#footer" className="hover:text-foreground transition-colors">Cookies</Link>
            <span>Built with &#10084;&#65039; in Egypt</span>
            <span>Powered by Youhana Zkria</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
