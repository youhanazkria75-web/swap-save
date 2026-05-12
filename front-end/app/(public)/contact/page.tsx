'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Mail, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/form-elements'
import { toast } from 'sonner'
import { API_BASE_URL as API_URL } from '@/lib/api-config'

type InquiryType = 'general' | 'dispute' | 'report' | 'billing' | 'technical'

type ContactForm = {
  fullName: string
  email: string
  inquiryType: InquiryType
  subject: string
  message: string
}

type FormErrors = Partial<Record<keyof ContactForm, string>>
type ApiRecord = Record<string, unknown>

const INQUIRY_TYPES: InquiryType[] = ['general', 'dispute', 'report', 'billing', 'technical']
const FORM_FIELDS: Array<keyof ContactForm> = ['fullName', 'email', 'inquiryType', 'subject', 'message']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INITIAL_FORM: ContactForm = {
  fullName: '',
  email: '',
  inquiryType: 'general',
  subject: '',
  message: '',
}

const isRecord = (value: unknown): value is ApiRecord =>
  typeof value === 'object' && value !== null

const isFormField = (value: string): value is keyof ContactForm =>
  FORM_FIELDS.includes(value as keyof ContactForm)

const isInquiryType = (value: string): value is InquiryType =>
  INQUIRY_TYPES.includes(value as InquiryType)

const getApiMessage = (data: unknown, fallback: string) =>
  isRecord(data) && typeof data.message === 'string' ? data.message : fallback

const getValidationErrors = (data: unknown): FormErrors => {
  if (!isRecord(data) || !Array.isArray(data.errors)) {
    return {}
  }

  return data.errors.reduce<FormErrors>((errors, item) => {
    if (!isRecord(item)) {
      return errors
    }

    const field = typeof item.path === 'string'
      ? item.path
      : typeof item.param === 'string'
        ? item.param
        : ''

    if (isFormField(field) && typeof item.msg === 'string') {
      errors[field] = item.msg
    }

    return errors
  }, {})
}

const validateForm = (form: ContactForm): FormErrors => {
  const errors: FormErrors = {}

  if (!form.fullName.trim()) {
    errors.fullName = 'Full name is required'
  }

  if (!form.email.trim()) {
    errors.email = 'Email is required'
  } else if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Enter a valid email address'
  }

  if (!INQUIRY_TYPES.includes(form.inquiryType)) {
    errors.inquiryType = 'Choose a valid inquiry type'
  }

  if (!form.subject.trim()) {
    errors.subject = 'Subject is required'
  }

  if (!form.message.trim()) {
    errors.message = 'Message is required'
  }

  return errors
}

export default function ContactPage() {
  const [form, setForm] = useState<ContactForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const requestedType = new URLSearchParams(window.location.search).get('type') || window.location.hash.replace('#', '')

    if (isInquiryType(requestedType)) {
      setForm(current => ({ ...current, inquiryType: requestedType }))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('token') || ''

    if (!token) {
      return () => {
        cancelled = true
      }
    }

    const prefillUser = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data: unknown = await response.json().catch(() => null)

        if (!response.ok || !isRecord(data) || !isRecord(data.user) || cancelled) {
          return
        }

        const user = data.user
        const firstName = typeof user.first_name === 'string' ? user.first_name : typeof user.firstName === 'string' ? user.firstName : ''
        const lastName = typeof user.last_name === 'string' ? user.last_name : typeof user.lastName === 'string' ? user.lastName : ''
        const name = `${firstName} ${lastName}`.trim()
        const email = typeof user.email === 'string' ? user.email : ''

        setForm(current => ({
          ...current,
          fullName: current.fullName || name,
          email: current.email || email,
        }))
      } catch {
        // Guests and expired sessions can still submit the contact form.
      }
    }

    prefillUser()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const validationErrors = validateForm(form)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      toast.error('Please fix the highlighted fields')
      return
    }

    setSending(true)

    try {
      const token = localStorage.getItem('token') || ''
      const response = await fetch(`${API_URL}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(form),
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        const apiErrors = getValidationErrors(data)
        setErrors(apiErrors)
        throw new Error(getApiMessage(data, 'Failed to send your message.'))
      }

      setForm(INITIAL_FORM)
      setErrors({})
      setSent(true)
      toast.success('Message sent', {
        description: 'We will review your message as soon as possible.',
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send your message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-950 to-teal-900 text-white py-14">
        <div className="page-container text-center max-w-xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
          <p className="text-white/60">Send a message to the Swap & Save support inbox.</p>
        </div>
      </div>

      <div className="page-container py-12 max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10">
          {/* Form */}
          <div className="bg-card rounded-2xl border border-border p-8">
            {sent ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">Message sent!</h2>
                <p className="text-muted-foreground mb-6">We will review your message as soon as possible.</p>
                <Button variant="outline" onClick={() => setSent(false)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold mb-1">Send us a message</h2>
                  <p className="text-sm text-muted-foreground">Support requests are handled through this form.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Full name *</Label>
                    <Input
                      id="fullName"
                      value={form.fullName}
                      onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                      placeholder="Your name"
                      aria-invalid={Boolean(errors.fullName)}
                    />
                    {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email address *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="your@email.com"
                      aria-invalid={Boolean(errors.email)}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Inquiry type *</Label>
                  <div className="flex flex-wrap gap-2">
                    {INQUIRY_TYPES.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, inquiryType: type }))}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors capitalize ${form.inquiryType === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {errors.inquiryType && <p className="text-xs text-destructive">{errors.inquiryType}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="Brief subject line"
                    aria-invalid={Boolean(errors.subject)}
                  />
                  {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Describe your issue or question in detail..."
                    rows={6}
                    aria-invalid={Boolean(errors.message)}
                  />
                  {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
                </div>

                <Button type="submit" className="w-full" size="lg" loading={sending}>
                  Send Message
                </Button>
              </form>
            )}
          </div>

          {/* Info sidebar */}
          <div className="space-y-5">
            {[
              { icon: Mail, title: 'Support channel', desc: 'Messages are submitted through this form', sub: 'No public support email is advertised here' },
              { icon: ShieldCheck, title: 'Account context', desc: 'Logged-in messages can be linked to your account', sub: 'Guests can still submit with name and email' },
              { icon: Clock, title: 'Review', desc: 'New messages go to the admin support inbox', sub: 'Safety-related reports are prioritized during review' },
            ].map(({ icon: Icon, title, desc, sub }) => (
              <div key={title} className="bg-card rounded-xl border border-border p-5 flex gap-4">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-sm text-foreground">{desc}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
