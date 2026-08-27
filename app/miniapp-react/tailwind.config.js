/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050507',
        card: '#0c0c10',
        elevated: '#14141a',
        'card-border': 'rgba(255, 255, 255, 0.08)',
        accent: '#ffffff',
        'accent-dim': '#e4e4e7',
        'accent-muted': '#a1a1aa',
        success: '#ffffff',
        warning: '#d4d4d8',
        error: '#f87171',
        txt: '#ffffff',
        txt2: '#8e8e98',
        txt3: '#52525b',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '22px',
        btn: '16px',
        pill: '9999px',
      },
      boxShadow: {
        glow: '0 0 24px rgba(255, 255, 255, 0.12)',
        'glow-lg': '0 0 48px rgba(255, 255, 255, 0.18)',
        'glow-white': '0 0 32px rgba(255, 255, 255, 0.25)',
        'card-glass': '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
    },
  },
  plugins: [],
};
