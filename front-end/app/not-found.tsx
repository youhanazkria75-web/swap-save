import Link from 'next/link'
import { ArrowLeftRight, Home, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="flex justify-center mb-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
            <ArrowLeftRight className="h-10 w-10 text-muted-foreground/50" />
          </div>
        </div>
        <h1 className="text-6xl font-bold gradient-text mb-4">404</h1>
        <h2 className="text-xl font-semibold mb-3">Page not found</h2>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          Looks like this swap didn't go through. The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link href="/"><Home className="h-4 w-4" /> Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/marketplace"><Search className="h-4 w-4" /> Browse products</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
