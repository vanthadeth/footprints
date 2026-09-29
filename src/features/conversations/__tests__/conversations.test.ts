import { describe, expect, it } from 'vitest'
import {
  OUTCOME_GROUPS,
  findMentions,
  outcomeChips,
  splitOutcomeGroups,
  suggestedNotify,
  toggleOutcome,
  type Colleague,
} from '../conversationMeta'
import { addDaysYmd, followUpIso, formatFollowDate, presetDate, todayYmd } from '../followUp'
import { filterCounts, matchesFilter, unreadSummary, type ThreadRow } from '../threads'
import { colleagueName } from '../useColleagues'

// Wed 30 Sep 2026, 10:00 in Phnom Penh (03:00 UTC).
const WED = new Date('2026-09-30T03:00:00Z')

describe('follow-up presets', () => {
  it('resolves Tomorrow and In 3 days across the month end', () => {
    expect(todayYmd(WED)).toBe('2026-09-30')
    expect(presetDate('tomorrow', WED)).toBe('2026-10-01')
    expect(presetDate('in3', WED)).toBe('2026-10-03')
    expect(formatFollowDate(presetDate('tomorrow', WED))).toBe('Thu 1 Oct')
    expect(formatFollowDate(presetDate('in3', WED))).toBe('Sat 3 Oct')
  })

  it('uses the picked date, or a week out when none is picked yet', () => {
    expect(presetDate('pick', WED, '2026-10-12')).toBe('2026-10-12')
    expect(presetDate('pick', WED)).toBe('2026-10-07')
  })

  it('uses the Phnom Penh day, not UTC, late in the evening', () => {
    // 17:30 UTC on Wed 30 Sep is already 00:30 Thu 1 Oct in Phnom Penh.
    expect(todayYmd(new Date('2026-09-30T17:30:00Z'))).toBe('2026-10-01')
  })

  it('stores times as Phnom Penh wall-clock', () => {
    expect(followUpIso('2026-10-01', '09:00')).toBe('2026-10-01T02:00:00.000Z')
    expect(addDaysYmd('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('outcomes', () => {
  it('keeps the exact labels from the design', () => {
    expect(OUTCOME_GROUPS.map((g) => [g.label, g.options])).toEqual([
      ['Payment status', ['Paid in full', 'Partially paid', 'Delay payment', 'Denied to pay', 'Notify only']],
      ['Order status', ['Ordered', 'Will order', 'No order']],
      ['Delivery status', ['Confirmed', 'Will check', 'Not yet received', 'Lost', 'Dispute']],
      ['Conflict status', ['Critical', 'Moderate', 'Mild', 'Resolved']],
    ])
  })

  it('suggests groups from the picked purposes', () => {
    const { suggested, more } = splitOutcomeGroups(['collection', 'conflict'])
    expect(suggested.map((g) => g.key)).toEqual(['payment', 'conflict'])
    expect(more.map((g) => g.key)).toEqual(['order', 'delivery'])
    expect(splitOutcomeGroups(['care']).suggested.map((g) => g.key)).toEqual(['order'])
  })

  it('is single choice, and tapping the same value clears it', () => {
    let o = toggleOutcome({}, 'payment', 'Delay payment')
    expect(o).toEqual({ payment: 'Delay payment' })
    o = toggleOutcome(o, 'payment', 'Paid in full')
    expect(o).toEqual({ payment: 'Paid in full' })
    expect(toggleOutcome(o, 'payment', 'Paid in full')).toEqual({})
  })

  it('turns stored columns into chips with a severity', () => {
    expect(outcomeChips({ outcome_payment: 'Denied to pay', outcome_conflict: 'Resolved', outcome_order: null })).toEqual([
      { group: 'payment', label: 'Payment: Denied to pay', value: 'Denied to pay', severity: 'bad' },
      { group: 'conflict', label: 'Conflict: Resolved', value: 'Resolved', severity: 'good' },
    ])
  })
})

const people: Colleague[] = [
  { id: 'me', full_name: 'Sreymom Chea', nickname: 'Sreymom', photo_path: null, role_key: 'sale_admin', role_name: 'Sale Admin' },
  { id: 'rep', full_name: 'Ravy Chan', nickname: null, photo_path: null, role_key: 'sales', role_name: 'Sales Team' },
  { id: 'acc', full_name: 'Lina Seng', nickname: null, photo_path: null, role_key: 'accounting', role_name: 'Accounting' },
  { id: 'mgr', full_name: 'Sophea Long', nickname: null, photo_path: null, role_key: 'sales_manager', role_name: 'Sale Manager' },
  { id: 'sok', full_name: 'Sok', nickname: null, photo_path: null, role_key: 'sales', role_name: 'Sales Team' },
  { id: 'sokd', full_name: 'Sok Dara', nickname: null, photo_path: null, role_key: 'sales', role_name: 'Sales Team' },
]

describe('notify suggestions', () => {
  const base = { colleagues: people, meId: 'me', customerOwnerId: 'rep' }
  it('notifies the rep and Accounting for collections', () => {
    expect(suggestedNotify({ ...base, purposes: ['collection'], outcomes: {} }).sort()).toEqual(['acc', 'rep'])
  })
  it('adds the Sale Manager for delayed payment or a conflict', () => {
    expect(suggestedNotify({ ...base, purposes: ['followup'], outcomes: { payment: 'Delay payment' } }).sort()).toEqual(['acc', 'mgr', 'rep'])
    expect(suggestedNotify({ ...base, purposes: ['conflict'], outcomes: {} }).sort()).toEqual(['mgr', 'rep'])
  })
  it('never suggests yourself', () => {
    expect(suggestedNotify({ ...base, customerOwnerId: 'me', purposes: ['care'], outcomes: {} })).toEqual([])
  })
})

describe('mentions', () => {
  it('matches the longest name and ignores partial words', () => {
    expect(findMentions('@Sok Dara please call', people, colleagueName)).toEqual(['sokd'])
    expect(findMentions('@Sok and @Lina Seng', people, colleagueName).sort()).toEqual(['acc', 'sok'])
    expect(findMentions('@Sokha is not Sok', people, colleagueName)).toEqual([])
    expect(findMentions('thanks @sreymom!', people, colleagueName)).toEqual(['me'])
  })
})

function thread(id: string, over: Partial<ThreadRow>): ThreadRow {
  return {
    post_id: id,
    customer_id: 'c',
    customer_name: 'Shop',
    kind: 'call',
    direction: 'outgoing',
    purposes: ['care'],
    outcome_payment: null,
    outcome_order: null,
    outcome_delivery: null,
    outcome_conflict: null,
    follow_up_at: null,
    reason: 'mine',
    is_mention: false,
    is_reply: false,
    is_mine: false,
    is_due: false,
    last_author_id: null,
    last_author_name: null,
    last_body: null,
    last_at: '2026-09-30T03:00:00Z',
    unread_count: 0,
    ...over,
  }
}

describe('messages list', () => {
  const list = [
    thread('a', { reason: 'mention', is_mention: true, is_mine: true, unread_count: 2 }),
    thread('b', { reason: 'reply', is_reply: true, unread_count: 1 }),
    thread('c', { reason: 'mine', is_mine: true }),
    thread('d', { reason: 'due', is_due: true }),
  ]
  it('counts a thread under every filter it matches', () => {
    expect(filterCounts(list)).toEqual({ all: 4, mention: 1, reply: 1, mine: 2, due: 1 })
    expect(matchesFilter(list[0], 'mine')).toBe(true)
  })
  it('summarises unread messages', () => {
    expect(unreadSummary(list).text).toBe('3 unread in 2 conversations')
    expect(unreadSummary([list[2]]).text).toBe('All caught up')
  })
})
