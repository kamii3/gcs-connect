/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // GCS CONNECT — Official Black & Emerald Palette
        gcs: {
          bg: '#121816',          // Primary background
          emerald: '#00A879',     // Emerald accent
          mint: '#B6F1D9',        // Pale mint
          surface: '#E9EFEC',     // Secondary surface
          card: '#1C2420',        // Card background
          sidebar: '#151D19',     // Sidebar background
          received: '#25372E',    // Message received bubble
          sent: '#205B45',        // Message sent bubble
          text: '#F0F5F1',        // Main text
          muted: '#A4B5AA',       // Secondary text
          border: '#31463A',      // Border
          error: '#D94D55',       // Error / Hangup
          warning: '#D99B31',     // Warning / Reconnecting
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'emerald-sm': '0 1px 2px 0 rgba(0, 168, 121, 0.1)',
        'emerald-md': '0 4px 6px -1px rgba(0, 168, 121, 0.15)',
        'emerald-lg': '0 10px 15px -3px rgba(0, 168, 121, 0.2)',
        'card': '0 4px 20px 0 rgba(0, 0, 0, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
