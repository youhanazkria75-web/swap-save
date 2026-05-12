import Link from 'next/link'
import { ShieldOff, Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="flex justify-center mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10">
            <ShieldOff className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-destructive mb-4">403</h1>
        <h2 className="text-xl font-semibold mb-3">Access denied</h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          You don't have permission to access this page. If you believe this is an error, 
          please contact our support team.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link href="/"><Home className="h-4 w-4" /> Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login"><ArrowLeft className="h-4 w-4" /> Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
