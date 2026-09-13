/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Toggled by src/lib/theme.ts (adds/removes `dark` on <html>) rather than
  // following the OS setting unconditionally -- the app has a manual
  // light/dark switch, so it needs an explicit class to react to.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Journey + trust palette. Kept deliberately restrained: one brand
        // blue, one earth accent for footprints/routes, neutral grays for
        // everything else. Avoid adding more saturated colors here --
        // status color (below) already carries the "state" signal.
        brand: {
          50: '#eaf3fb',
          100: '#cfe4f6',
          400: '#3d8bd4',
          500: '#1668b8',
          600: '#0f5090',
          700: '#0b3c68',
          // Hero-card background (dashboard, journey header) -- dark enough
          // for white text at AA contrast, still readably "our blue" rather
          // than a neutral black.
          900: '#041c30',
        },
        earth: {
          50: '#faf1e4',
          400: '#b48a5a',
          500: '#96703f',
        },
        status: {
          // Kept as universal success/state colors, independent of brand --
          // "verified"/"working" should read as green regardless of what
          // the primary brand color is. Only `visiting` moves (it used to
          // be blue, which is now the brand color and would be ambiguous
          // next to primary buttons/links).
          working: '#0f6e4f',
          idling: '#b48a5a',
          visiting: '#6552c9',
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
