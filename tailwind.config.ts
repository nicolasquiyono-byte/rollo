import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        rollo: {
          bg: '#0a0a0a',
          surface: '#161616',
          accent: '#ff3b30',
          gold: '#d4af37',
          ink: '#f5f5f5',
          muted: '#9a9a9a',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        digital: ['"DSEG14Classic"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-slow': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 600ms ease-out forwards',
        'fade-in-slow': 'fade-in-slow 1000ms ease-out forwards',
      },
    },
  },
  plugins: [],
};
export default config;
