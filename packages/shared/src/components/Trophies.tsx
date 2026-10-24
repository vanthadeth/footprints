import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, History, X } from 'lucide-react'
import { MEDAL } from './trophyMedals'
import {
  TROPHIES,
  earnedTier,
  historySub,
  historyTotals,
  monthSummary,
  needText,
  nextLine,
  nextTier,
  percentOf,
  statusText,
  tierBar,
  tierLabel,
  tierName,
  tierToGo,
  tileState,
  tileSub,
  trophyDef,
  type HistoryMonth,
  type Lang,
  type Medal,
  type MonthProgress,
  type Tier,
  type TrophyDef,
  type TrophyId,
  type TrophyProgress,
} from './trophies'

const medalAlt = (m: Medal) => `${trophyDef(m.id).name}, ${m.tier}`

/** A medal that is not earned: the gold one in grey, fainter when nothing has been done yet. */
function MedalImage({ def, p, className = '' }: { def: TrophyDef; p: TrophyProgress; className?: string }) {
  const tier = earnedTier(def, p)
  const state = tileState(def, p)
  return <img src={MEDAL[def.id][tier ?? 'gold']} alt="" className={`tr-img ${state === 'earned' ? '' : state === 'progress' ? 'tr-faded' : 'tr-faded tr-faint'} ${className}`} />
}

interface SheetProps {
  title: string
  subtitle?: string
  onClose: () => void
  overlay?: 'fixed' | 'absolute'
  /** Leave out for sheets that do not scroll a list (the details sheet draws its own). */
  children: ReactNode
}

/** A bottom sheet over a dimmed screen: handle, title with a round close button, a scrolling body and a Close button. */
function Sheet({ title, subtitle, onClose, overlay = 'fixed', children }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className={`tr-layer tr-${overlay}`}>
      <button type="button" className="tr-dim" aria-label="Close" onClick={onClose} />
      <div className="tr-sheet" role="dialog" aria-label={title}>
        <div className="tr-sh-top">
          <i className="tr-handle" />
          <div className="tr-sh-head">
            <div>
              <p className="tr-sh-title">{title}</p>
              {subtitle && <p className="tr-sh-sub">{subtitle}</p>}
            </div>
            <button type="button" className="tr-x" aria-label="Close" onClick={onClose}><X size={18} strokeWidth={2.4} aria-hidden="true" /></button>
          </div>
        </div>
        {children}
        <div className="tr-sh-foot"><button type="button" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}

/** Next unlocks: every trophy with its status, a progress bar ticked at each tier, what comes next and how it is counted. */
export function NextUnlocksSheet({ progress, monthLabel, onClose, overlay, defaultOpen }: { progress: MonthProgress; monthLabel: string; onClose: () => void; overlay?: 'fixed' | 'absolute'; defaultOpen?: TrophyId }) {
  const sum = monthSummary(progress)
  return (
    <Sheet title="Next unlocks" subtitle={`${monthLabel} · ${sum.count} of ${sum.total} trophies earned`} onClose={onClose} overlay={overlay}>
      <div className="tr-body">
        {TROPHIES.map((def) => {
          const p = progress[def.id]
          const earned = earnedTier(def, p)
          const next = nextTier(def, earned)
          const pct = Math.min(100, percentOf(def, p))
          const ticks = [def.silver, def.gold].filter((t): t is number => t !== undefined)
          return (
            <div key={def.id} className="tr-nrow">
              <MedalImage def={def} p={p} />
              <div className="tr-grow">
                <div className="tr-nl1">
                  <span className="tr-nname">{def.name}</span>
                  <span className={`tr-chip tr-chip-${earned ?? 'none'}`}>{tierLabel(earned)}</span>
                </div>
                <p className="tr-status">{statusText(def, p)}</p>
                <div className="tr-bar">
                  <i className={next ? '' : 'tr-done'} style={{ width: `${pct}%` }} />
                  {ticks.map((t) => <b key={t} style={{ left: `${t}%` }} />)}
                </div>
                <p className="tr-next">{next ? `Next unlock: ${tierName(def, next)}` : 'Top tier reached'}</p>
                <p className="tr-need">{next ? needText(def, p, next) : 'Keep it up. Resets on the 1st.'}</p>
                <details open={defaultOpen === def.id}>
                  <summary><ChevronRight size={14} strokeWidth={2.6} className="tr-chev" aria-hidden="true" />How it is counted</summary>
                  <p>{def.how}</p>
                </details>
              </div>
            </div>
          )
        })}
        <p className="tr-reset">Trophies are earned each month and reset on the 1st.</p>
      </div>
    </Sheet>
  )
}

/** Trophy history: one row per month with the medals won. */
export function TrophyHistorySheet({ months, onClose, overlay }: { months: HistoryMonth[]; onClose: () => void; overlay?: 'fixed' | 'absolute' }) {
  const t = historyTotals(months)
  return (
    <Sheet title="Trophy history" subtitle={`Last ${months.length} months · ${t.trophies} trophies · ${t.gold} gold`} onClose={onClose} overlay={overlay}>
      <div className="tr-hh"><span>MONTH</span><span>TROPHIES</span></div>
      <div className="tr-body tr-hbody">
        {months.map((m) => (
          <div key={m.label} className="tr-hrow">
            <span className="tr-hm"><b>{m.label}</b><span>{historySub(m)}</span></span>
            <span className="tr-hmed">
              {m.medals.map((x) => <img key={x.id} src={MEDAL[x.id][x.tier]} alt={medalAlt(x)} className="tr-img" />)}
              {m.medals.length === 0 && <span className="tr-none">No trophies</span>}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** One trophy in detail: the medal, the percentage, both tiers with their rule and progress, and what to do next. */
export function TrophyDetailsSheet({ id, progress, monthLabel, onClose, overlay }: { id: TrophyId; progress: TrophyProgress; monthLabel: string; onClose: () => void; overlay?: 'fixed' | 'absolute' }) {
  const def = trophyDef(id)
  const earned = earnedTier(def, progress)
  const pct = percentOf(def, progress)
  const big = def.kind === 'rate' ? `${pct}% ${def.id === 'attendance' ? 'attendance' : 'accuracy'}` : `${pct}% of target`
  const lates = progress.lates ?? []
  const detail =
    def.id === 'attendance'
      ? `${lates.length ? `${lates.length} late (${lates.reduce((a, b) => a + b, 0)} minutes)` : 'no late'}, ${progress.absences ? `${progress.absences} absence` : 'no absence'}`
      : def.kind === 'target'
        ? `${def.money ? `$${progress.actual.toLocaleString('en-US')} of $${(progress.target ?? 0).toLocaleString('en-US')}` : `${progress.actual} of ${progress.target ?? 0} ${def.noun}`} this month`
        : ''
  const tiers: Tier[] = def.silver !== undefined ? ['gold', 'silver'] : ['gold']
  const reached = (t: Tier) => earned === t || (earned === 'gold' && t === 'silver')
  return (
    <Sheet title={`${def.name} · ${earned ? tierLabel(earned) : 'in progress'}`} subtitle={`${earned ? 'Earned' : 'Not earned yet'} · ${monthLabel}`} onClose={onClose} overlay={overlay}>
      <div className="tr-body tr-details">
        <div className="tr-dhead">
          <MedalImage def={def} p={progress} className="tr-big" />
          <div>
            <p className="tr-pct">{big}</p>
            {detail && <p className="tr-sub2">{detail}</p>}
          </div>
        </div>
        {tiers.map((t) => (
          <div key={t} className="tr-tier">
            <img src={MEDAL[def.id][t]} alt="" className={`tr-img ${reached(t) ? '' : 'tr-faded'}`} />
            <span className="tr-grow">
              <b>{t === 'gold' ? 'Gold' : 'Silver'}</b>
              <small>{def.rule[t]}</small>
              {!reached(t) && <span className="tr-bar tr-wide"><i style={{ width: `${tierBar(def, progress, t)}%` }} /></span>}
            </span>
            <span className="tr-togo">{reached(t) ? 'Earned' : tierToGo(def, progress, t)}</span>
          </div>
        ))}
        <p className="tr-line">{nextLine(def, progress)}</p>
        <p className="tr-how">{def.how}</p>
      </div>
    </Sheet>
  )
}

/** The five trophies as tiles: label, medal, progress bar and what is missing; a finished one shows no bar. */
export function TrophyTiles({ progress, lang = 'en', onSelect }: { progress: MonthProgress; lang?: Lang; onSelect?: (id: TrophyId) => void }) {
  return (
    <div className="tr-tiles">
      {TROPHIES.map((def) => {
        const p = progress[def.id]
        const earned = earnedTier(def, p)
        const done = earned !== null && nextTier(def, earned) === null
        const state = tileState(def, p)
        const bar = Math.min(100, percentOf(def, p))
        return (
          <button key={def.id} type="button" className="tr-tile" aria-label={`${def.name}, ${tierLabel(earned)}, ${percentOf(def, p)}%`} onClick={() => onSelect?.(def.id)}>
            <span className="tr-tl">{def.short[lang]}</span>
            <MedalImage def={def} p={p} />
            {!done && (
              <>
                <span className="tr-pbar"><i className={state === 'earned' ? '' : 'tr-off'} style={{ width: `${bar}%` }} /></span>
                <span className="tr-ts">{tileSub(def, p, lang)}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

interface CardProps {
  progress: MonthProgress
  /** "October". */
  monthLabel: string
  /** Last month's medals, for the footer; the history icon opens the history sheet. */
  lastMonth?: { name: string; medals: Medal[] }
  history?: HistoryMonth[]
  /** `fixed` covers the screen (the app); `absolute` stays inside the nearest positioned parent (previews). */
  overlay?: 'fixed' | 'absolute'
  /** Open a sheet on first render (previews, tests). */
  defaultSheet?: 'unlocks' | 'history'
  className?: string
}

/** The trophies card for the Today screen: this month's earned medals, "+N to unlock", and last month's. Tapping opens Next unlocks or the history. */
export function TrophyCard({ progress, monthLabel, lastMonth, history = [], overlay = 'fixed', defaultSheet, className = '' }: CardProps) {
  const [sheet, setSheet] = useState<'unlocks' | 'history' | null>(defaultSheet ?? null)
  const sum = monthSummary(progress)
  const close = () => setSheet(null)
  return (
    <div className={className}>
      <section className="tr-card" aria-label="Trophies">
        <div className="tr-hd">
          <span className="tr-ttl">Trophies <span>· {monthLabel} · {sum.count} of {sum.total}</span></span>
          <button type="button" className="tr-cta" onClick={() => setSheet('unlocks')}>Next unlocks<ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" /></button>
        </div>
        <div className="tr-row5">
          {sum.medals.map((m) => (
            <button key={m.id} type="button" className="tr-tb" aria-label={medalAlt(m)} onClick={() => setSheet('unlocks')}>
              <img src={MEDAL[m.id][m.tier]} alt="" className="tr-img" />
            </button>
          ))}
          {sum.toUnlock > 0 && (
            <button type="button" className="tr-more" aria-label={`${sum.toUnlock} more trophies to unlock`} onClick={() => setSheet('unlocks')}>
              <b>+{sum.toUnlock}</b><span>to unlock</span>
            </button>
          )}
        </div>
        {lastMonth && (
          <button type="button" className="tr-foot" aria-label={`Trophy history, last ${history.length || 12} months`} onClick={() => setSheet('history')}>
            <span className="tr-fl"><span>Last month</span><b>{lastMonth.name}</b></span>
            <span className="tr-mi">{lastMonth.medals.map((m) => <img key={m.id} src={MEDAL[m.id][m.tier]} alt={medalAlt(m)} />)}</span>
            <History size={22} strokeWidth={2} aria-hidden="true" className="tr-hist" />
          </button>
        )}
      </section>
      {sheet === 'unlocks' && <NextUnlocksSheet progress={progress} monthLabel={`${monthLabel} 2026`} onClose={close} overlay={overlay} />}
      {sheet === 'history' && <TrophyHistorySheet months={history} onClose={close} overlay={overlay} />}
    </div>
  )
}
