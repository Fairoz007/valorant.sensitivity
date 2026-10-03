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
          black: '#080e15',
          dark: '#101a24',
          card: '#13202c',
          border: '#2b414e',
          muted: '#a2b3bf'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Bahnschrift', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
