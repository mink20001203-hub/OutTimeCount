/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'sentinel-white': '#FFFFFF',
        'sentinel-bg': '#F8F9FA',
        'sentinel-dark-bg': '#121212',
        'sentinel-dark-card': '#1E1E1E',
        'sentinel-green': '#00FF94',
        'sentinel-black': '#121212',
      },
      fontFamily: {
        sans: ['"Inter"', '"Pretendard"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        headline: ['"Inter"', 'sans-serif'],
      },
      animation: {
        'pulse-gentle': 'pulse-gentle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-gentle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        }
      }
    },
  },
  plugins: [],
}
