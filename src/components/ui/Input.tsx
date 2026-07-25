import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-1.5" style={{ color: '#6B7280' }}>
          {label}
        </label>
      )}
      <input
        className={`line-input ${className}`}
        {...props}
      />
    </div>
  )
}
