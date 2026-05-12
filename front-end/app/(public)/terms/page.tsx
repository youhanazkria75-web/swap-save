import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function TermsPage() {
  const SECTIONS = [
    {
      title: '1. Acceptance of Terms',
      content: 'By accessing or using Swap & Save, you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform. We may update these terms at any time; continued use constitutes acceptance of the revised terms.',
    },
    {
      title: '2. Eligibility',
      content: 'You must be at least 18 years old to use Swap & Save. By registering, you confirm that all information you provide is accurate, complete, and current. Accounts found to be fraudulent or used by minors will be suspended.',
    },
    {
      title: '3. The Exchange Model',
      content: 'Swap & Save facilitates product exchanges between users. No cash changes hands directly between users through the platform. A service fee is charged to both parties upon admin approval of a swap. This fee covers platform operations, admin review, and trust infrastructure.',
    },
    {
      title: '4. Admin Review & Approval',
      content: 'Every swap request is subject to admin review before completion. Our team verifies product authenticity, value fairness, and user compliance. Admin decisions are final. We reserve the right to reject any swap at our discretion without detailed explanation.',
    },
    {
      title: '5. User Conduct',
      content: 'You agree not to: share personal contact details before admin approval; attempt to conduct exchanges outside the platform; post fraudulent, misleading, or prohibited items; harass, threaten, or abuse other users; create multiple accounts or impersonate others.',
    },
    {
      title: '6. Product Listings',
      content: 'You are solely responsible for the accuracy of your product listings. You warrant that you own the item, have the right to exchange it, and that it is accurately described. Listing counterfeit, stolen, illegal, or prohibited items will result in immediate suspension.',
    },
    {
      title: '7. Service Fees & Coins',
      content: 'Service fees are non-refundable once a swap is completed. Coins purchased are non-refundable except in cases of platform error. We reserve the right to modify pricing at any time with reasonable notice.',
    },
    {
      title: '8. Disputes & Liability',
      content: 'Swap & Save provides a dispute resolution process but is not liable for the condition or value of exchanged items. Our liability is limited to the service fees paid. We encourage users to inspect items carefully before confirming completion.',
    },
    {
      title: '9. Privacy',
      content: 'Our Privacy Policy governs how we collect and use your data. By using Swap & Save, you consent to our data practices as described in the Privacy Policy.',
    },
    {
      title: '10. Termination',
      content: 'We reserve the right to suspend or terminate your account at any time for violations of these terms, suspicious activity, or any conduct we determine to be harmful to the platform or its users.',
    },
  ]

  return (
    <div className="page-container py-12 max-w-3xl mx-auto">
      <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to home
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground text-sm">Last updated: March 1, 2024</p>
      </div>

      <div className="prose prose-sm max-w-none space-y-8">
        <p className="text-muted-foreground leading-relaxed">
          Welcome to Swap & Save. These Terms of Service govern your use of our platform, 
          including our website, mobile applications, and all related services.
        </p>

        {SECTIONS.map(section => (
          <div key={section.title} className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-base font-bold mb-3">{section.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
          </div>
        ))}

        <div className="p-4 bg-muted/50 rounded-xl text-xs text-muted-foreground">
          If you have questions about these Terms, use the{' '}
          <Link href="/contact" className="text-primary hover:underline">Contact page</Link>.
        </div>
      </div>
    </div>
  )
}
