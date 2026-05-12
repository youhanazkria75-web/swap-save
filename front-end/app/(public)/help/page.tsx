'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, MessageSquare, Mail, ShieldCheck, ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FAQ_SECTIONS = [
  {
    title: 'Getting started',
    questions: [
      { q: 'How does Swap & Save work?', a: 'You list products you want to trade, find something you like, and offer one of your own items in exchange. Our admin team reviews the swap before it completes, ensuring fairness and safety for both parties.' },
      { q: 'Is it free to use?', a: 'Creating an account and listing products is free. When a swap is approved by our admin team, both parties pay a small service fee in EGP to complete the exchange. You also get 50 free coins on signup.' },
      { q: 'What are Coins?', a: 'Coins are our in-platform currency. You can use them to feature your products for more visibility, or spend them when you run out of free swap slots. Purchase coin packs from the Coins page.' },
      { q: 'Do I need an account to browse?', a: 'No! You can browse all products without logging in. However, to request a swap, add products, or message other users, you need a verified account.' },
    ],
  },
  {
    title: 'Swap requests',
    questions: [
      { q: 'How do I request a swap?', a: 'On any product page, click "Request a Swap", select one of your listed products to offer, write an optional message, and submit. The product owner will be notified immediately.' },
      { q: 'What happens after I send a request?', a: 'The receiver can accept or decline your interest. If they accept, you both enter the structured discussion phase where you can ask questions about the items. Then you both submit to admin review.' },
      { q: 'Can I cancel a swap request?', a: 'Yes, you can cancel a request before it reaches the "Under Review" stage. Once in admin review or beyond, cancellation may require admin involvement.' },
      { q: 'Why are values important?', a: 'While swaps don\'t involve cash, the platform checks that estimated values are reasonably comparable to ensure fairness. Large value gaps may be flagged by the admin.' },
    ],
  },
  {
    title: 'Admin review & approval',
    questions: [
      { q: 'Why does every swap need admin review?', a: 'Admin review is our core safety feature. Our team verifies product authenticity, checks value fairness, reviews the discussion history, and looks for any red flags before approving.' },
      { q: 'How long does review take?', a: 'Review timing depends on the swap details and any safety concerns. You can follow status changes in the app when an admin decision is recorded.' },
      { q: 'What can cause a swap to be rejected?', a: 'Common rejection reasons: significantly mismatched values, insufficient product photos, suspicious communication patterns, or unverified user accounts.' },
      { q: 'Can I appeal a rejection?', a: 'Yes. Use the Contact page with your swap ID and reason for appeal so the admin team can review the context.' },
    ],
  },
  {
    title: 'Exchange & meetup',
    questions: [
      { q: 'How do we actually exchange the products?', a: 'After approval, you choose a meetup method. We recommend meeting at a safe, public location (we suggest shopping malls). Both parties then confirm completion in the app.' },
      { q: 'Is delivery available?', a: 'Delivery integration is coming soon. Currently, in-person meetup is the primary exchange method. We will notify you when delivery becomes available.' },
      { q: 'What if the item isn\'t as described?', a: 'You can open a dispute within 24 hours of the meetup. Our admin team will review the case and mediate between both parties. Always inspect items carefully before confirming completion.' },
      { q: 'When should I confirm completion?', a: 'Only confirm when you have physically received the item and you\'re satisfied with it. Once both parties confirm, the swap is final and ratings open.' },
    ],
  },
  {
    title: 'Safety & trust',
    questions: [
      { q: 'How do I stay safe during a swap?', a: 'Never share personal contact details before admin approval. Use the platform\'s discussion panel. For meetups, choose public places during daylight hours. Report any suspicious behaviour immediately.' },
      { q: 'What is the Trust Score?', a: 'Your Trust Score (0–100) is calculated from your verification status, completed swaps, ratings received, and account age. Higher scores unlock more visibility and trust badges.' },
      { q: 'How do ratings work?', a: 'After every completed swap, both parties rate each other from 1–5 stars and can leave comments and tags. Your average rating is shown publicly on your profile.' },
      { q: 'How do I report a user or product?', a: 'On any product page or user profile, look for the "Report" button. You can also report messages within a swap discussion. All reports are reviewed by our admin team.' },
    ],
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-4 text-left gap-4 hover:text-primary transition-colors"
      >
        <span className="font-medium text-sm">{q}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">
          {a}
        </div>
      )}
    </div>
  )
}

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState(0)

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-950 to-teal-900 text-white py-14">
        <div className="page-container text-center max-w-xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Help Center</h1>
          <p className="text-white/60">Everything you need to know about Swap & Save</p>
        </div>
      </div>

      <div className="page-container py-12">
        <div className="grid lg:grid-cols-[240px_1fr] gap-10">
          {/* Section nav */}
          <div className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              {FAQ_SECTIONS.map((section, i) => (
                <button
                  key={section.title}
                  onClick={() => {
                    setActiveSection(i)
                    const el = document.getElementById(`faq-section-${i}`)
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    activeSection === i ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {section.title}
                </button>
              ))}
              <div className="pt-4 border-t border-border mt-4">
                <p className="text-xs text-muted-foreground mb-2 px-3">Still need help?</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/contact">Contact us</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* FAQ content */}
          <div id="faq" className="space-y-10">
            {FAQ_SECTIONS.map((section, i) => (
              <div key={section.title} id={`faq-section-${i}`}>
                <h2
                  id={section.title === 'Exchange & meetup' ? 'dispute-resolution' : undefined}
                  className="text-lg font-bold mb-4"
                >
                  {section.title}
                </h2>
                <div className="bg-card rounded-xl border border-border px-5">
                  {section.questions.map(faq => (
                    <FAQItem key={faq.q} q={faq.q} a={faq.a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Support options */}
        <div className="mt-16 pt-10 border-t border-border">
          <h2 className="text-xl font-bold text-center mb-8">Still need help?</h2>
          <div className="grid sm:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {[
              { icon: MessageSquare, title: 'Support Inbox', desc: 'Send a message through the Contact page', cta: 'Open form', href: '/contact' },
              { icon: Mail, title: 'Account Help', desc: 'Ask about billing, technical issues, or account access', cta: 'Contact support', href: '/contact' },
              { icon: ShieldCheck, title: 'Report a Problem', desc: 'Report bugs, disputes, or safety concerns', cta: 'File a report', href: '/contact?type=report' },
            ].map(({ icon: Icon, title, desc, cta, href }) => (
              <div key={title} className="bg-card rounded-xl border border-border p-6 text-center">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{desc}</p>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={href}>{cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
