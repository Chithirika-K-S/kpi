import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ── Colors ── */
      colors: {
        ink:     'var(--ink)',
        card:    'var(--card)',
        rim:     'var(--rim)',
        gold:    'var(--gold)',
        jade:    'var(--jade)',
        rose:    'var(--rose)',
        sky:     'var(--sky)',
        muted:   'var(--muted)',
        subdued: 'var(--subdued)',
        surface: 'var(--surface)',
      },

      /* ── Typography ── */
      fontFamily: {
        display: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        body:    ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },

      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        modal: '0 20px 60px -10px rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
};

export default config;
