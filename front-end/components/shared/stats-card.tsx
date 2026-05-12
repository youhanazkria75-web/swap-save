import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  trend?: { value: number; label: string }
  color?: 'default' | 'green' | 'blue' | 'amber' | 'red' | 'teal' | 'purple'
  className?: string
}

const COLOR_MAP = {
  default: { icon: 'bg-muted text-muted-foreground', ring: '' },
  green:   { icon: 'bg-green-100 text-green-600', ring: 'ring-green-100' },
  blue:    { icon: 'bg-blue-100 text-blue-600', ring: 'ring-blue-100' },
  amber:   { icon: 'bg-amber-100 text-amber-600', ring: 'ring-amber-100' },
  red:     { icon: 'bg-red-100 text-red-600', ring: 'ring-red-100' },
  teal:    { icon: 'bg-teal-100 text-teal-600', ring: 'ring-teal-100' },
  purple:  { icon: 'bg-purple-100 text-purple-600', ring: 'ring-purple-100' },
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'default',
  className,
}: StatsCardProps) {
  const colors = COLOR_MAP[color]
  const trendPositive = trend && trend.value >= 0

  return (
    <div className={cn('bg-card rounded-xl border border-border p-5 shadow-card', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold mt-1 tracking-tight truncate">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
          {trend && (
            <p className={cn('text-xs font-medium mt-1.5', trendPositive ? 'text-green-600' : 'text-red-500')}>
              {trendPositive ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  )
}
