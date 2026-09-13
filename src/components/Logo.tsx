import iconLight from '@/assets/logo-icon.png'
import iconDark from '@/assets/logo-icon-dark.png'

/**
 * The icon mark's accent dot is solid black in the light asset --
 * invisible against a dark card/sidebar. Dark mode swaps in a variant
 * with a light dot instead of a CSS filter, which would also distort the
 * mark's blue/green. Both <img>s render; `dark:` toggles which is visible,
 * so this needs no JS and updates instantly with the theme class.
 */
export function LogoIcon({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return (
    <>
      <img src={iconLight} alt={alt} className={`${className} dark:hidden`} />
      <img src={iconDark} alt={alt} className={`hidden ${className} dark:block`} />
    </>
  )
}
