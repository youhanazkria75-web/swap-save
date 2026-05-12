import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPage() {
  const SECTIONS = [
    { title: 'Information We Collect', content: 'We collect information you provide directly: name, email, phone number, location, and product listings. We also collect usage data, device information, and interaction logs to improve the platform and detect fraud.' },
    { title: 'How We Use Your Information', content: 'Your data is used to operate the platform, verify your identity, match you with swap partners, process service fees, send notifications, detect suspicious activity, and improve our services. We do not sell your personal data to third parties.' },
    { title: 'Data Sharing', content: 'We share limited profile information with other users as necessary for swap coordination. We share data with payment processors for fee collection. We may share data with law enforcement when required by law.' },
    { title: 'Data Security', content: 'We use industry-standard encryption and security practices. However, no method of transmission over the Internet is 100% secure. We encourage you to use a strong, unique password and enable two-factor authentication.' },
    { title: 'Your Rights', content: 'You have the right to access, correct, or delete your personal data. You can do this through your account settings or by contacting our support team. Data deletion requests are processed within 30 days.' },
    { title: 'Cookies', content: 'We use cookies and similar technologies to maintain your session, remember preferences, and analyze platform usage. You can control cookie settings in your browser, though some features may not function without them.' },
    { title: 'Children\'s Privacy', content: 'Swap & Save is not intended for users under 18. We do not knowingly collect personal information from minors. If we discover that a minor has registered, we will immediately delete their account and data.' },
    { title: 'Changes to This Policy', content: 'We may update this Privacy Policy periodically. We will notify you of significant changes via email or in-app notification. Continued use after notification constitutes acceptance of the revised policy.' },
  ]

  return (
    <div className="page-container py-12 max-w-3xl mx-auto">
      <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to home
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Privacy Policy</h1>
            <p className="text-muted-foreground text-sm">Last updated: March 1, 2024</p>
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Your privacy matters to us. This policy explains what data we collect, how we use it, and your rights.
        </p>
      </div>

      <div className="space-y-4">
        {SECTIONS.map(section => (
          <div key={section.title} className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-base font-bold mb-3">{section.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-muted/50 rounded-xl text-xs text-muted-foreground">
        Questions about privacy?{' '}
        <Link href="/contact" className="text-primary hover:underline">Contact us</Link>
      </div>
    </div>
  )
}
