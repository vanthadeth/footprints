import { fromKey, type DateKey } from './calendar'

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Thursday 23 Oct", the small date line above a tab screen's title. */
export function dateLine(key: DateKey): string {
  const d = fromKey(key)
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`
}

/** "Good morning, Dara": morning before 12:00, afternoon before 18:00, evening after. */
export function greeting(hour: number, firstName: string): string {
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `Good ${part}, ${firstName}`
}

/** "DS" from "Dara Sok": first letters of the first and last word, upper case; one letter for a single name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export type NotificationKind = 'alert' | 'announcement' | 'approved' | 'reminder'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  /** "9:12" today, "Tue" earlier. */
  time: string
  unread?: boolean
}

/** How many items are unread. */
export const unreadCount = (items: NotificationItem[]) => items.filter((i) => i.unread).length

export type Preference = 'khmer' | 'dark'
