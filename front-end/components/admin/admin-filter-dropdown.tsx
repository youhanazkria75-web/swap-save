'use client'

import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type AdminFilterDropdownOption = {
  value: string
  label: string
  disabled?: boolean
}

type AdminFilterDropdownProps = {
  value: string
  options: readonly AdminFilterDropdownOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
  disabled?: boolean
}

export function AdminFilterDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}: AdminFilterDropdownProps) {
  const selectedOption = options.find(option => option.value === value)
  const selectedLabel = selectedOption?.label || value || 'Select'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'inline-flex h-9 w-full sm:w-auto min-w-[9rem] max-w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm transition-colors',
            'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-lg"
      >
        {options.map(option => {
          const selected = option.value === value

          return (
            <DropdownMenuItem
              key={option.value}
              disabled={option.disabled}
              onSelect={() => onChange(option.value)}
              className={cn(
                'cursor-pointer justify-between rounded-lg px-2.5 py-2 text-sm',
                selected && 'bg-primary/10 text-primary focus:bg-primary/10 focus:text-primary'
              )}
            >
              <span className="truncate">{option.label}</span>
              <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
