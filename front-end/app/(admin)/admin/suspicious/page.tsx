import { redirect } from 'next/navigation'

export default function SuspiciousRedirectPage() {
  redirect('/admin/suspicious-activity')
}
