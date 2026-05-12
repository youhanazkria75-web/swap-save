import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { AppProvider } from '@/contexts/app-context'
import { Toaster } from 'sonner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Swap & Save — AI-Powered Product Exchange',
    template: '%s | Swap & Save',
  },
  description:
    'The smart, safe way to exchange products. No cash needed — swap what you have for what you want, verified and protected by our platform.',
  keywords: ['product exchange', 'swap', 'barter', 'marketplace', 'trade'],
  openGraph: {
    title: 'Swap & Save',
    description: 'AI-Powered Product Exchange Marketplace',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans min-h-screen bg-background antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AppProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                classNames: {
                  toast: 'font-sans',
                },
              }}
            />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}