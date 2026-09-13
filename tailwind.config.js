/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Journey + trust palette. Kept deliberately restrained: one brand
        // green, one earth accent for footprints/routes, neutral grays for
        // everything else. Avoid adding more saturated colors here --
        // status color (below) already carries the "state" signal.
        brand: {
          50: '#eaf5ef',
          100: '#cde8d9',
          400: '#2f9468',
          500: '#0f6e4f',
          600: '#0b5940',
          700: '#08432f',
        },
        earth: {
          400: '#b48a5a',
          500: '#96703f',
        },
        status: {
          working: '#0f6e4f',
          idling: '#b48a5a',
          visiting: '#1d6fb8',
          off: '#8a8f98',
          warn: '#b8590f',
          danger: '#c23b3b',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
