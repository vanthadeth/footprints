import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, MapPinned, TrendingUp, type LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/haptic'
import { LogoFull } from '@/components/Logo'

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: CalendarCheck, title: 'Plan your day', body: 'See who to visit and what to do the moment you open the app.' },
  { icon: MapPinned, title: 'Visit your customers', body: 'Check in at every stop and record what happened, in seconds.' },
  { icon: TrendingUp, title: 'Track your progress', body: 'Watch your visits, sales, and effort add up as the day goes.' },
]

export function WelcomePage() {
  const navigate = useNavigate()
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  function onScroll() {
    const el = trackRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.clientWidth)
    setActive(index)
  }

  function goTo(index: number) {
    const el = trackRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
    setActive(index)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-brand-50 to-neutral-50 px-6 safe-top safe-bottom dark:from-neutral-900 dark:to-neutral-950">
      <div className="flex flex-1 animate-fade-in-up flex-col items-center justify-center text-center">
        <LogoFull alt="Footprints, by HIG" className="mb-4 h-16 w-16 drop-shadow-sm" />
        <h1 className="text-2xl font-semibold uppercase tracking-wide text-neutral-900">Footprints</h1>
        <p className="mt-0.5 text-sm font-medium text-brand-600">by HIG</p>
        <p className="mt-4 max-w-xs text-base font-medium leading-snug text-neutral-700">
          Your day. Your customers.
          <br />
          Your progress.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-roledescription="carousel"
          aria-label="How Footprints works"
        >
          {STEPS.map((step, i) => (
            <div key={step.title} className="w-full shrink-0 snap-center px-2 text-center" aria-hidden={active !== i}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-neutral-800 dark:text-brand-300">
                <step.icon className="h-7 w-7" aria-hidden />
              </div>
              <h2 className="mt-3 text-base font-semibold text-neutral-900">{step.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5" role="tablist" aria-label="Step">
          {STEPS.map((step, i) => (
            <button
              key={step.title}
              role="tab"
              aria-selected={active === i}
              aria-label={`Step ${i + 1}: ${step.title}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all tap-target ${
                active === i ? 'w-6 bg-brand-500' : 'w-1.5 bg-neutral-300 dark:bg-neutral-700'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm py-8">
        <button
          onClick={() => {
            haptic('light')
            navigate('/login')
          }}
          className="w-full rounded-xl bg-brand-500 py-4 text-base font-semibold uppercase tracking-wide text-white shadow-card transition-colors active:bg-brand-600"
        >
          Get Started
        </button>
      </div>
    </div>
  )
}
