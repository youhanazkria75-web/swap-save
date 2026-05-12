'use client'

import { Input, Label } from '@/components/ui/form-elements'
import { cn } from '@/lib/utils'

type LocationFieldsProps = {
  country: string
  city: string
  area: string
  disabled?: boolean
  className?: string
  required?: boolean
  onCountryChange: (value: string) => void
  onCityChange: (value: string) => void
  onAreaChange: (value: string) => void
}

export function LocationFields({
  country,
  city,
  area,
  disabled = false,
  className,
  required = false,
  onCountryChange,
  onCityChange,
  onAreaChange,
}: LocationFieldsProps) {
  return (
    <div className={cn('grid sm:grid-cols-3 gap-4', className)}>
      <div className="space-y-1.5">
        <Label>Country{required && ' *'}</Label>
        <Input
          value={country}
          disabled={disabled}
          onChange={event => onCountryChange(event.target.value)}
          placeholder="Country"
        />
      </div>

      <div className="space-y-1.5">
        <Label>City{required && ' *'}</Label>
        <Input
          value={city}
          disabled={disabled}
          onChange={event => onCityChange(event.target.value)}
          placeholder="City"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Area{required && ' *'}</Label>
        <Input
          value={area}
          disabled={disabled}
          onChange={event => onAreaChange(event.target.value)}
          placeholder="Area"
        />
      </div>
    </div>
  )
}
