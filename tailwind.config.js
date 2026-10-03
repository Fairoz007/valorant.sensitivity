/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        val: {
          red: '#ff4655',
          darkRed: '#d1363a',
          cyan: '#00f5d4',
          darkCyan: '#05c7ac',
          gold: '#ece8e1',
          black: '#0f1923',
          dark: '#141e28',
          card: '#1b2733',
          border: '#2b3846',
          muted: '#8b978f'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
