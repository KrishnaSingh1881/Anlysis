import React from 'react'

interface NeoInsetProps {
  children: React.ReactNode
  className?: string
}

export function NeoInset({ children, className = '' }: NeoInsetProps) {
  return (
    <div className={`bg-neo-bg rounded-neo-sm shadow-neo-inset p-6 ${className}`}>
      {children}
    </div>
  )
}
