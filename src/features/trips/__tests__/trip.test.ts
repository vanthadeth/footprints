import { describe, expect, it } from 'vitest'
import { DEFAULT_RATES, busyText, costOf, dayLabel, earliestStart, hoursBefore, km, money, planTrip, roomSplit, roomsFor, strip, type TripDayInput } from '../trip'

const DEMO: TripDayInput[] = [
  { provinces: ['TKO', 'KMP'], night: 'KMP', rooms: 2 },
  { provinces: ['KEP', 'KMP'], night: 'KMP', rooms: 2 },
  { provinces: ['KPS'], night: 'KPS', rooms: 1 },
  { provinces: ['KSP'], night: null, rooms: null },
]

describe('km', () => {
  it('estimates road distance from provincial capitals', () => {
    expect(km('PNH', 'KMP')).toBe(160)
    expect(km('PNH', 'KPS')).toBe(220)
    expect(km('KMP', 'KMP')).toBe(0)
    expect(km('PNH', 'XXX')).toBe(0)
  })
})

describe('planTrip', () => {
  it('dates each day, starts each day where the last one slept and totals the route', () => {
    const p = planTrip('2026-10-05', DEMO)
    expect(p.range).toBe('Mon 5 Oct – Thu 8 Oct')
    expect(p.length).toBe('4 days, 3 nights')
    expect(p.days.map((d) => d.from)).toEqual(['PNH', 'KMP', 'KMP', 'KPS'])
    expect(p.days.map((d) => d.km)).toEqual([175, 50, 85, 225])
    expect(p.totalKm).toBe(535)
    expect(p.days[1].nightN).toBe(2)
    expect(p.back).toBe(true)
    expect(p.longest?.n).toBe(4)
    expect(p.provinces).toEqual(['TKO', 'KMP', 'KEP', 'KPS', 'KSP'])
  })

  it('draws the route as a strip with overnights folded in', () => {
    expect(strip(planTrip('2026-10-05', DEMO)).map((s) => `${s.label}:${s.kind}`)).toEqual([
      'Phnom Penh:home',
      'Takeo:visit',
      'Kampot:night',
      'Kep:visit',
      'Kampot:night',
      'Sihanoukville:night',
      'Kampong Speu:visit',
      'Phnom Penh:home',
    ])
  })
})

describe('rooms and cost', () => {
  it('defaults rooms to people per room, rounded up, and splits people across rooms', () => {
    expect(roomsFor({ rooms: null }, 3, 2)).toBe(2)
    expect(roomsFor({ rooms: 1 }, 3, 2)).toBe(1)
    expect(roomSplit(3, 2)).toEqual([2, 1])
    expect(roomSplit(5, 2)).toEqual([3, 2])
  })

  it('costs allowance per person-day, hotel per room-night, fuel once, plus special lines', () => {
    const c = costOf(planTrip('2026-10-05', DEMO), DEFAULT_RATES, 3, [
      { reason: 'Ferry / boat', note: '', amount: 24 },
      { reason: 'Parking & tolls', note: '', amount: 8 },
    ])
    expect(c.lines.map((l) => l.value)).toEqual([120, 75, 53.5, 32])
    expect(c.roomNights).toBe(5)
    expect(c.total).toBe(280.5)
    expect(c.perPerson).toBe(93.5)
    expect(c.over).toBe(false)
    expect(money(c.total)).toBe('$280.50')
    expect(money(1240)).toBe('$1,240')
  })

  it('flags special allowance over the limit', () => {
    const c = costOf(planTrip('2026-10-05', DEMO), DEFAULT_RATES, 1, [{ reason: 'Customer event', note: '', amount: 120 }])
    expect(c.over).toBe(true)
    expect(c.lines[0].calc).toBe('4 days × 1 person × $10')
  })
})

describe('notice', () => {
  // Wed 30 Sep 2026 15:00 in Phnom Penh.
  const now = new Date('2026-09-30T08:00:00Z')

  it('counts hours until 08:00 on day 1, Phnom Penh time', () => {
    expect(hoursBefore('2026-10-01', '08:00', now)).toBe(17)
    expect(hoursBefore('2026-10-02', '08:00', now)).toBe(41)
  })

  it('finds the earliest start with enough notice', () => {
    expect(earliestStart(24, '08:00', now)).toBe('2026-10-02')
    expect(earliestStart(0, '08:00', now)).toBe('2026-10-01')
  })
})

describe('busyText', () => {
  it('groups busy days inside the trip by reason', () => {
    const busy = [
      { day: '2026-10-06', why: 'On another trip' },
      { day: '2026-10-07', why: 'On another trip' },
      { day: '2026-10-07', why: 'Leave' },
      { day: '2026-10-20', why: 'Leave' },
    ]
    expect(busyText(busy, '2026-10-05', '2026-10-08')).toBe('On another trip Tue 6 Oct, Wed 7 Oct · Leave Wed 7 Oct')
    expect(busyText([], '2026-10-05', '2026-10-08')).toBe('')
    expect(dayLabel('2026-10-15')).toBe('Thu 15 Oct')
  })
})
