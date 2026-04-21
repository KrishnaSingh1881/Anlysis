import React from 'react'

interface ABCCellProps {
  type: 'A' | 'B' | 'C'
  size?: 'sm' | 'md' | 'lg'
}

export function ABCCell({ type, size = 'md' }: ABCCellProps) {
  const sizes = {
    sm: 'h-7 w-10 text-xs',
    md: 'h-10 w-12 text-sm',
    lg: 'h-12 w-14 text-base',
  }

  const styles = {
    A: 'bg-neo-cellA text-neo-cellAText',
    B: 'bg-neo-cellB text-neo-cellBText',
    C: 'bg-neo-cellC text-neo-cellCText',
  }

  return (
    <div
      className={`${sizes[size]} ${styles[type]} rounded-neo-xs shadow-neo-raised-sm flex items-center justify-center font-bold`}
    >
      {type}
    </div>
  )
}
