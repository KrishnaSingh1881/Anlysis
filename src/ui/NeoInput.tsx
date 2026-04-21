import React from 'react'

interface NeoInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function NeoInput({ label, error, className = '', ...props }: NeoInputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-neo-textPrimary">{label}</label>}
      <input
        className={`bg-neo-bg shadow-neo-inset rounded-neo-xs px-4 py-3 text-neo-textPrimary focus:outline-none focus:shadow-neo-raised-sm transition-shadow ${error ? 'ring-2 ring-neo-danger' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-neo-danger">{error}</span>}
    </div>
  )
}
