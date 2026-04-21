import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        neo: {
          bg: '#E4E9F0',
          surface: '#EEF2F7',
          shadowDark: '#C8CDD4',
          shadowLight: '#FFFFFF',
          accent: '#4A7FBD',
          accentSoft: '#7BA7D4',
          textPrimary: '#2D3748',
          textSecondary: '#718096',
          success: '#48BB78',
          warning: '#ECC94B',
          danger: '#FC8181',
          cellA: '#C6EDD8',
          cellAText: '#276749',
          cellB: '#FDF3C8',
          cellBText: '#92620A',
          cellC: '#FDD5D5',
          cellCText: '#9B2C2C',
        }
      },
      boxShadow: {
        'neo-raised': '6px 6px 14px #C8CDD4, -6px -6px 14px #FFFFFF',
        'neo-raised-sm': '3px 3px 7px #C8CDD4, -3px -3px 7px #FFFFFF',
        'neo-inset': 'inset 4px 4px 10px #C8CDD4, inset -4px -4px 10px #FFFFFF',
        'neo-inset-sm': 'inset 2px 2px 5px #C8CDD4, inset -2px -2px 5px #FFFFFF',
        'neo-btn': '4px 4px 10px #C8CDD4, -4px -4px 10px #FFFFFF',
      },
      borderRadius: {
        'neo': '16px',
        'neo-sm': '12px',
        'neo-xs': '8px',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      }
    }
  }
}
export default config
