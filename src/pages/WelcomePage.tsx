import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { haptic } from '@/lib/haptic'
import logo from '@/assets/logo-full.png'

const SLIDES = [
  {
    title: 'Your sales journey starts here',
    body: 'Track your working day and customer visits effortlessly.',
  },
  {
    title: 'Every visit leaves a footprint',
    body: 'Record where and when you meet your customers.',
  },
  {
    title: 'See your journey clearly',
    body: 'Review your visits, movement, attendance, and performance.',
  },
  {
    title: 'Stay connected with your team',
    body: 'Supervisors can monitor the sales fleet and support the team.',
  },
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
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <img src={logo} alt="Footprints, by HIG" className="mb-4 h-20 w-20 drop-shadow-sm" />
        <h1 className="text-2xl font-semibold text-neutral-900">Footprints</h1>
        <p className="mt-1 text-sm font-medium text-brand-600">by HIG</p>
        <p className="mt-3 max-w-xs text-sm text-neutral-500">Journal your sales journey.</p>
      </div>

      <div className="w-full max-w-sm">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-roledescription="carousel"
          aria-label="About Footprints"
        >
          {SLIDES.map((slide, i) => (
            <div key={slide.title} className="w-full shrink-0 snap-center px-2 text-center" aria-hidden={active !== i}>
              <h2 className="text-base font-semibold text-neutral-900">{slide.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{slide.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5" role="tablist" aria-label="Slide">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.title}
              role="tab"
              aria-selected={active === i}
              aria-label={`Slide ${i + 1}`}
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
          className="w-full rounded-xl bg-brand-500 py-4 text-base font-semibold text-white shadow-card transition-colors active:bg-brand-600"
        >
          Start the Journey
        </button>
      </div>
    </div>
  )
}
