import { describe, expect, it } from 'vitest'
import { NOTIFICATION_KIND_META, type NotificationKind } from '../notificationKindMeta'

const ALL_KINDS: NotificationKind[] = ['late_clock_in', 'idling_too_long', 'ineffective_visit']

describe('NOTIFICATION_KIND_META', () => {
  it('has an entry for every notification kind the database can produce', () => {
    for (const kind of ALL_KINDS) {
      expect(NOTIFICATION_KIND_META[kind]).toBeDefined()
      expect(NOTIFICATION_KIND_META[kind].labelKey).not.toBe('')
      expect(NOTIFICATION_KIND_META[kind].tone).toContain('text-')
    }
  })
})
