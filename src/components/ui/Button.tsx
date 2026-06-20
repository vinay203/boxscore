import { motion } from 'framer-motion'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  children: ReactNode
  fullWidth?: boolean
}

const variants = {
  primary: 'app-button app-button--primary py-3 px-6',
  secondary: 'app-button app-button--secondary py-3 px-6',
  ghost: 'app-button app-button--ghost py-2 px-4',
  danger: 'app-button app-button--danger wicket-button py-3 px-6',
}

export function Button({
  variant = 'primary',
  children,
  fullWidth,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={`btn-press ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...(props as object)}
    >
      {children}
    </motion.button>
  )
}
