import { Minus, Plus } from 'lucide-react'

interface StepperProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}

export function Stepper({
  label,
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
}: StepperProps) {
  return (
    <div className="stepper-row flex items-center justify-between py-3">
      <span className="text-sm font-medium text-heading">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          className="stepper-button btn-press"
        >
          <Minus size={18} />
        </button>
        <span className="stepper-value">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          className="stepper-button plus btn-press"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}
