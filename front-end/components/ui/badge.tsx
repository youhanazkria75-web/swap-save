// Badge
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive/10 text-destructive',
        outline: 'border border-border text-foreground',
        success: 'bg-green-50 text-green-700 border border-green-200',
        warning: 'bg-amber-50 text-amber-700 border border-amber-200',
        info: 'bg-blue-50 text-blue-700 border border-blue-200',
        pending: 'bg-amber-50 text-amber-700 border border-amber-200',
        approved: 'bg-green-50 text-green-700 border border-green-200',
        rejected: 'bg-red-50 text-red-700 border border-red-200',
        completed: 'bg-blue-50 text-blue-700 border border-blue-200',
        'in-progress': 'bg-teal-50 text-teal-700 border border-teal-200',
        cancelled: 'bg-gray-100 text-gray-600 border border-gray-200',
        featured: 'bg-amber-50 text-amber-700 border border-amber-200',
        new: 'bg-blue-50 text-blue-700 border border-blue-200',
        trusted: 'bg-green-50 text-green-700 border border-green-200',
        risky: 'bg-red-50 text-red-700 border border-red-200',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
