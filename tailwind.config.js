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
        'sentinel-dark-bg': '#0A0A0A',
        'sentinel-dark-card': '#141414',
        'sentinel-green': '#00FF94',
        'sentinel-black': '#121212',
      },
      fontFamily: {
        sans: ['"Noto Sans KR"', '"Inter"', '"Pretendard"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        headline: ['"Noto Sans KR"', 'sans-serif'],
      },
      animation: {
        'pulse-gentle': 'pulse-gentle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-gentle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        }
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(0, 255, 148, 0.15), inset 0 0 15px rgba(0, 255, 148, 0.05)',
        'glow-green-lg': '0 0 30px rgba(0, 255, 148, 0.2), inset 0 0 20px rgba(0, 255, 148, 0.08)',
      },
    },
  },
  plugins: [],
}
