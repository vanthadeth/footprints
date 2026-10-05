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
        // `neutral`) -- a cool blue-slate, one consistent hue family from
        // light to dark (tying it to brand blue) rather than shifting hue
        // partway through. Light shades (50-300) are a pale blue-white for
        // page background and most light-mode text/borders; dark shades
        // (800-950) are a blue-black for every dark-mode surface, both via
        // direct `dark:` classes and index.css's "dark-mode retrofit"
        // block, which hardcodes these same 800/900/950/50-600 values for
        // the classes that have no explicit dark: variant of their own.
        // brand (blue) and status.working (green) are untouched on purpose.
        // Polish palette (design canvas › Foundations). Neutrals are pure
        // greys, not tinted: light page #f4f4f4 with white cards and #1c1c1c
        // text; the dark end (800-950) is the dark theme's card (#232323)
        // and page (#1c1c1c) so dark: classes and the retrofit block in
        // index.css land on the same surfaces as the canvas.
        neutral: {
          50: '#f4f4f4',
          100: '#ececec',
          200: '#e3e3e3',
          300: '#d0d0d0',
          400: '#8a8a8a',
          500: '#666666',
          600: '#4d4d4d',
          700: '#3a3a3a',
          800: '#2e2e2e',
          900: '#232323',
          950: '#1c1c1c',
        },
        // Blue from the app palette (base #0085FF). Text and fills use the
        // darker D20/D40 steps because the base blue is under 4.5:1 on
        // white; 400 is the L20 step for links on dark surfaces.
        brand: {
          50: '#E6F3FF',
          100: '#CCE7FF',
          200: '#B3DAFF',
          400: '#339DFF',
          500: '#006ACC',
          600: '#005099',
          700: '#003566',
          // Hero-card background (check-in, journey header): the canvas uses
          // a near-black neutral, the same in light and dark.
          900: '#2b2b2b',
        },
        earth: {
          50: '#faf1e4',
          400: '#b48a5a',
          500: '#96703f',
        },
        status: {
          // Green, orange and red from the app palette, at the D-steps that
          // pass 4.5:1 as text on white. `visiting` stays violet so it never
          // reads as a primary (blue) button.
          working: '#00701F',
          idling: '#b48a5a',
          visiting: '#6552c9',
          off: '#8a8f98',
          warn: '#955000',
          danger: '#BA2323',
        },
      },
      fontFamily: {
        // Google Sans first (loaded in index.html), as on the canvas.
        // "Noto Sans Khmer" only covers the Khmer script -- browsers fall
        // through to it per-character, so English text still renders on
        // the system font above and only Khmer glyphs (thin/inconsistent
        // in the system UI fonts across platforms) pick it up. Loaded via
        // the Google Fonts <link> in index.html.
        sans: ['"Google Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', '"Noto Sans Khmer"', 'sans-serif'],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 2px 8px rgb(0 0 0 / 0.05)',
      },
      borderRadius: {
        // Overriding the core scale (not just extending xl2) so every
        // rounded-lg/xl/2xl button, input, and sheet across the app picks
        // up the canvas radii from one place, not just the custom card radius.
        // rounded-full (avatars, pills, switches, badges) is untouched --
        // those are meant to be fully round, not "corner rounding".
        // Canvas radii: 10px chips, 14px buttons and inputs, 18px cards.
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
        xl2: '1.125rem',
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
