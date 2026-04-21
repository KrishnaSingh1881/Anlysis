import React from 'react'

interface NeoCardProps {
  children: React.ReactNode
  className?: string
}

export function NeoCard({ children, className = '' }: NeoCardProps) {
  return (
    <div className={`bg-neo-bg rounded-neo shadow-neo-raised p-5 ${className}`}>
      {children}
    </div>
  )
}
