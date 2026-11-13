/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Reativos ao tema — ver as CSS variables em src/styles/index.css.
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-ink-soft) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          muted: 'rgb(var(--color-surface-muted) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
        },
        // Fixo — cor de marca (barra lateral, avatares, botões primários).
        // Não inverte com o tema, propositalmente.
        brand: {
          DEFAULT: '#12161D',
        },
        blue: {
          deep: '#1B3B5F',
          mid: '#2E6FB0',
        },
        green: {
          deep: '#2B5F52',
          mid: '#3C8C74',
        },
        chrome: {
          1: '#B8BEC8',
          2: '#8B93A0',
          3: '#5B6270',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
