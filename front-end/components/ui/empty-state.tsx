import * as React from 'react'
import { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-20 text-center px-4',
      'border-2 border-dashed border-border rounded-2xl',
      className
    )}>
      {Icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-5">
          <Icon className="h-8 w-8 text-muted-foreground/40" />
        </div>
      )}
      <p className="text-lg font-semibold">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          <Button
            variant="outline"
            onClick={action.onClick}
            {...(action.href ? { asChild: true } : {})}
          >
            {action.href ? (
              <a href={action.href}>{action.label}</a>
            ) : action.label}
          </Button>
        </div>
      )}
    </div>
  )
}
