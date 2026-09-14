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
        //
        // The neutral scale itself is custom (not Tailwind's stock
        // `neutral`) -- inspired by a warm-cream/soft-plum reference UI. It
        // deliberately shifts hue along its own length rather than staying
        // one family end to end: warm cream/tan at the light shades (50-600
        // -- page background, most light-mode text/borders) crossing
        // through a muted bridge tone (700) into a cool plum-black at the
        // dark shades (800-950 -- every dark-mode surface, both via direct
        // `dark:` classes and index.css's "dark-mode retrofit" block, which
        // hardcodes these same 800/900/950/50-600 values for the classes
        // that have no explicit dark: variant of their own). brand (blue)
        // and status.working (green) are untouched on purpose.
        neutral: {
          50: '#faf8f3',
          100: '#f2eee3',
          200: '#e7dfce',
          300: '#d2c6ab',
          400: '#ab9c7d',
          500: '#8c7d61',
          600: '#6e624b',
          700: '#57505f',
          800: '#332d42',
          900: '#1e1a2b',
          950: '#14111d',
        },
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
        // Overriding the core scale (not just extending xl2) so every
        // rounded-lg/xl/2xl button, input, and sheet across the app gets
        // less round from one place, not just the custom card radius.
        // rounded-full (avatars, pills, switches, badges) is untouched --
        // those are meant to be fully round, not "corner rounding".
        lg: '0.375rem',
        xl: '0.5rem',
        '2xl': '0.75rem',
        xl2: '0.75rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.9)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        // Page/card entrances and the theme-toggle icon swap.
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.25s ease-out both',
        'slide-down': 'slide-down 0.25s ease-out both',
        'pop-in': 'pop-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
