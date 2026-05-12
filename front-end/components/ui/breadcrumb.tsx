import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
      <Link href="/" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <React.Fragment key={item.label}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
            {isLast || !item.href ? (
              <span className={cn(isLast && 'text-foreground font-medium')}>{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-foreground transition-colors truncate max-w-32">
                {item.label}
              </Link>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
