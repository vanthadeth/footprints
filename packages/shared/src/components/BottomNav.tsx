import { useEffect, useRef, useState } from 'react'
import { Check, Clock, MapPinCheck } from 'lucide-react'
import { badgeText, HOLD_MS, type NavTab } from './bottomNav'

interface Props {
  /** Four tabs: two left of Check In, two right. */
  tabs: NavTab[]
  /** The open tab's key, or "checkin". */
  active: string
  onSelect?: (key: string) => void
  /** Check In button: black clock before clock-in, a pin with a check and a green dot once clocked in. */
  clockedIn?: boolean
  /** The tab after Check In can be changed by holding it: the options, and what to do with the choice. */
  shortcut?: { options: NavTab[]; onChange: (key: string) => void }
  /** Open the shortcut menu on first render (previews, tests). */
  defaultMenuOpen?: boolean
  className?: string
}

function Badge({ count }: { count?: number }) {
  const t = badgeText(count)
  return t ? <i className="nav-bd">{t}</i> : null
}

/**
 * The bottom bar: four tabs and a round Check In button in the middle.
 * Same bar for every role; only the tabs change. The tab after Check In can be held
 * for half a second to choose what it shortcuts to. Colours come from the
 * --ab-* variables in styles.css (light and dark).
 */
export function BottomNav({ tabs, active, onSelect, clockedIn = false, shortcut, defaultMenuOpen = false, className = '' }: Props) {
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const held = useRef(false)
  /** The tab right after Check In (the 4th of the five), the one a person can change. */
  const shortcutTab = tabs[2]
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const holdProps = shortcut
    ? {
        onPointerDown: () => {
          held.current = false
          timer.current = setTimeout(() => {
            held.current = true
            setMenuOpen(true)
          }, HOLD_MS)
        },
        onPointerUp: () => clearTimeout(timer.current),
        onPointerLeave: () => clearTimeout(timer.current),
        onContextMenu: (e: React.SyntheticEvent) => {
          e.preventDefault()
          setMenuOpen(true)
        },
      }
    : {}

  const tab = (t: NavTab, index: number) => {
    const on = active === t.key
    const isShortcut = index === 2 && !!shortcut
    const Icon = t.icon
    return (
      <button
        key={t.key}
        type="button"
        className="nav-t"
        aria-current={on ? 'page' : undefined}
        aria-haspopup={isShortcut ? 'menu' : undefined}
        onClick={() => {
          if (held.current) {
            held.current = false
            return
          }
          onSelect?.(t.key)
        }}
        {...(isShortcut ? holdProps : {})}
      >
        <span className={`nav-pill${on ? ' nav-on' : ''}${isShortcut && menuOpen ? ' nav-hold' : ''}`}>
          <Icon size={24} strokeWidth={1.9} aria-hidden="true" />
          <Badge count={t.badge} />
        </span>
        <span className={`nav-tl${on ? ' nav-on' : ''}`}>{t.label}</span>
      </button>
    )
  }

  const checkInOn = active === 'checkin'
  return (
    <div className={`nav-wrap ${className}`}>
      {menuOpen && shortcut && (
        <>
          <button type="button" className="nav-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="nav-menu" role="menu" aria-label="Choose the shortcut tab">
            <p className="nav-mh">Shortcut tab</p>
            {shortcut.options.map((o) => {
              const cur = o.key === shortcutTab.key
              const Icon = o.icon
              return (
                <button
                  key={o.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={cur}
                  className={`nav-mr${cur ? ' nav-cur' : ''}`}
                  onClick={() => {
                    shortcut.onChange(o.key)
                    setMenuOpen(false)
                  }}
                >
                  <span className="nav-mi"><Icon size={22} strokeWidth={1.9} aria-hidden="true" /></span>
                  <span className="nav-ml">{o.label}</span>
                  {cur && <Check size={18} strokeWidth={2.4} aria-hidden="true" />}
                </button>
              )
            })}
            <p className="nav-mf">Hold the tab to change it any time</p>
          </div>
        </>
      )}
      <nav className="nav" aria-label="Main">
        {tab(tabs[0], 0)}
        {tab(tabs[1], 1)}
        <span className="nav-t">
          <button
            type="button"
            className={`nav-fab${clockedIn ? '' : ' nav-idle'}${checkInOn ? ' nav-on' : ''}`}
            aria-label={clockedIn ? 'Check in, clocked in' : 'Check in'}
            aria-current={checkInOn ? 'page' : undefined}
            onClick={() => onSelect?.('checkin')}
          >
            {clockedIn ? <MapPinCheck size={26} strokeWidth={1.9} aria-hidden="true" /> : <Clock size={26} strokeWidth={1.9} aria-hidden="true" />}
            {clockedIn && <i className="nav-live" />}
          </button>
        </span>
        {tab(tabs[2], 2)}
        {tab(tabs[3], 3)}
      </nav>
    </div>
  )
}
