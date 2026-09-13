import iconLight from '@/assets/logo-icon.png'
import iconDark from '@/assets/logo-icon-dark.png'
import fullLight from '@/assets/logo-full-light.png'
import fullDark from '@/assets/logo-full.png'

/**
 * Both logo marks have a small round accent dot whose only job is to sit
 * near-invisibly against its intended background -- which makes it vanish
 * outright on the *other* background. A CSS invert() filter would also
 * distort the mark's blue/green, so each variant is a real second asset
 * (same mark, only the dot recolored) rather than a filter. Both <img>s
 * render; `dark:` toggles which is visible, so this needs no JS and
 * updates instantly with the theme class.
 */
function ThemedImg({ light, dark, className, alt }: { light: string; dark: string; className: string; alt: string }) {
  return (
    <>
      <img src={light} alt={alt} className={`${className} dark:hidden`} />
      <img src={dark} alt={alt} className={`hidden ${className} dark:block`} />
    </>
  )
}

/** The small icon mark -- used where the logo sits directly on a card/sidebar background (Login, the desktop nav rail). */
export function LogoIcon({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return <ThemedImg light={iconLight} dark={iconDark} className={className} alt={alt} />
}

/** The larger full mark -- used on the Welcome screen. */
export function LogoFull({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return <ThemedImg light={fullLight} dark={fullDark} className={className} alt={alt} />
}
