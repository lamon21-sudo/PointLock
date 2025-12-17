/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366f1',
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        background: {
          DEFAULT: '#0f0f23',
          secondary: '#1a1a2e',
          tertiary: '#25253a',
        },
        surface: {
          DEFAULT: '#1e1e32',
          elevated: '#2a2a42',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
        win: '#22c55e',
        loss: '#ef4444',
        push: '#f59e0b',
      },
    },
  },
  plugins: [],
};
