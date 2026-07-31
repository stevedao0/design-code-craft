/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic surfaces
        surface: 'var(--bg-surface)',
        'surface-app': 'var(--bg-app)',
        'surface-subtle': 'var(--bg-subtle)',
        'surface-muted': 'var(--bg-muted)',
        'surface-inverse': 'var(--bg-inverse)',
        // Semantic text
        'fg-primary': 'var(--fg-primary)',
        'fg-secondary': 'var(--fg-secondary)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        'fg-inverse': 'var(--fg-inverse)',
        // Brand accents (3 tones)
        'accent-primary': 'var(--accent-primary)',
        'accent-primary-soft': 'var(--accent-primary-soft)',
        'accent-secondary': 'var(--accent-secondary)',
        'accent-secondary-soft': 'var(--accent-secondary-soft)',
        'accent-neutral': 'var(--accent-neutral)',
        'accent-neutral-soft': 'var(--accent-neutral-soft)',
        // Semantic status
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
        DEFAULT: 'var(--border-default)',
        strong: 'var(--border-strong)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '220ms',
        slow: '320ms',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s var(--ease-out) both',
        'scale-in': 'scale-in 0.25s var(--ease-out) both',
        'shimmer': 'shimmer 2.4s linear infinite',
      },
    },
  },
};
