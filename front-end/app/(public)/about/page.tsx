import Link from 'next/link'
import { ArrowLeftRight, ShieldCheck, Sparkles, Users, CheckCircle2, Star, Zap, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-950 to-teal-900 text-white py-20">
        <div className="page-container text-center max-w-2xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
              <ArrowLeftRight className="h-8 w-8" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4">About Swap & Save</h1>
          <p className="text-white/70 text-lg leading-relaxed">
            We're building a better way to exchange goods — one that's fair, safe, and smart.
            No cash, no listings, no scams. Just verified swaps between real people.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="page-container py-16 max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-bold mb-4">Our mission</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Swap & Save was built as a graduation project with a real-world vision: to create a
              marketplace where the currency is not money, but trust. By removing cash from the
              equation, we reduce fraud, level the playing field, and make sustainable consumption easy.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Every swap is reviewed by our admin team before it completes. We don't just connect
              strangers — we verify them, match them intelligently, and protect them throughout the exchange.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ShieldCheck, label: 'Admin protected', color: 'text-green-600 bg-green-50' },
              { icon: Sparkles, label: 'AI powered', color: 'text-purple-600 bg-purple-50' },
              { icon: Users, label: 'Community driven', color: 'text-blue-600 bg-blue-50' },
              { icon: Globe, label: 'Eco-friendly', color: 'text-teal-600 bg-teal-50' },
            ].map(({ icon: Icon, label, color }) => (
              <div key={label} className="bg-card rounded-xl border border-border p-5 text-center">
                <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center mx-auto mb-3`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="swap-journey" className="bg-muted/40 border-y border-border">
        <div className="page-container py-16">
          <h2 className="text-2xl font-bold text-center mb-10">The complete swap journey</h2>
          <div className="max-w-2xl mx-auto space-y-4">
            {[
              { n: 1, title: 'List your product', desc: 'Add photos, set estimated value and condition. Your item appears on the marketplace.' },
              { n: 2, title: 'Send or receive a swap request', desc: 'Found something you love? Offer one of your own products. Or wait for someone to find yours.' },
              { n: 3, title: 'Discuss inside the platform', desc: 'Use our structured discussion panel to ask questions and negotiate. No external contacts yet.' },
              { n: 4, title: 'Admin reviews the swap', desc: 'Our team verifies both products, checks values, and reviews the conversation for any red flags.' },
              { n: 5, title: 'Pay a small service fee', desc: 'Once approved, both parties pay a small platform fee to unlock the exchange step.' },
              { n: 6, title: 'Choose your exchange method', desc: 'Meet in person at a safe suggested location, or use our delivery integration.' },
              { n: 7, title: 'Confirm & rate', desc: 'Both parties confirm the swap is done. Ratings update, trust scores adjust, coins awarded.' },
            ].map(step => (
              <div key={step.n} className="flex gap-4 p-5 bg-card rounded-xl border border-border">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                  {step.n}
                </div>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI section */}
      <section id="ai-matching" className="page-container py-16 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" /> AI Matching Engine
          </div>
          <h2 className="text-2xl font-bold mb-3">How our AI finds your perfect match</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Our algorithm scores every potential swap from 0–100 based on four key factors.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { factor: 'Category', weight: '30%', desc: 'Same or complementary product category' },
            { factor: 'Value', weight: '28%', desc: 'Similar estimated market value range' },
            { factor: 'Location', weight: '22%', desc: 'Proximity for easier meetups' },
            { factor: 'Condition', weight: '20%', desc: 'Matching or comparable condition grades' },
          ].map(f => (
            <div key={f.factor} className="bg-card rounded-xl border border-border p-5 text-center">
              <div className="text-2xl font-bold gradient-text mb-1">{f.weight}</div>
              <p className="font-semibold mb-1">{f.factor}</p>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust section */}
      <section id="trust-safety" className="bg-muted/40 border-y border-border">
        <div className="page-container py-16 text-center max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold mb-3">Trust & safety first</h2>
          <p className="text-muted-foreground mb-8">
            Every feature is designed to protect users before, during, and after a swap.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 text-left">
            {[
              { icon: ShieldCheck, title: 'Admin oversight', items: ['Every swap reviewed before approval', 'Suspicious activity monitoring', 'Dispute resolution team'] },
              { icon: Star, title: 'Reputation system', items: ['5-star rating after each swap', 'Cumulative trust score', 'Verified badges for email & phone'] },
              { icon: Zap, title: 'Controlled flow', items: ['No personal contacts before approval', 'Structured discussion only', 'Progressive info reveal'] },
            ].map(({ icon: Icon, title, items }) => (
              <div key={title} className="bg-card rounded-xl border border-border p-5">
                <Icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-semibold mb-3">{title}</h3>
                <ul className="space-y-2">
                  {items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="page-container py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to try it?</h2>
        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg"><Link href="/signup">Get started free</Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/marketplace">Browse products</Link></Button>
        </div>
      </section>
    </div>
  )
}
