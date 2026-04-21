import React from 'react'

interface NeoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function NeoButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: NeoButtonProps) {
  const baseStyles = 'rounded-neo-sm font-semibold transition-shadow active:shadow-neo-inset'
  
  const variants = {
    primary: 'bg-neo-bg shadow-neo-btn text-neo-accent',
    accent: 'bg-neo-accent shadow-neo-btn text-white',
    success: 'bg-neo-success shadow-neo-btn text-white',
    warning: 'bg-neo-warning shadow-neo-btn text-white',
    danger: 'bg-neo-danger shadow-neo-btn text-white',
  }

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
