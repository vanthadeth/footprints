// Footprints sheet sync: pure helpers (no Deno APIs) so vitest can test them
// from the app side. The Edge Function (index.ts) fetches the CSV and talks
// to the database; everything about reading cells lives here.

export type FieldKey =
  | 'shop_name' | 'code' | 'business_type' | 'contact_name' | 'phone'
  | 'province' | 'district' | 'commune' | 'street_address' | 'landmark'
  | 'zipcode' | 'remarks' | 'lat_long' | 'credit_limit' | 'salesperson' | 'last_purchase_date' | 'balance'

export interface FieldDef {
  key: FieldKey
  label: string
  group: 'Customer' | 'Contact' | 'Address' | 'Sales'
  aliases: string[]
}

/** The customer fields a sheet column can fill, with header names we recognise. */
export const FIELDS: FieldDef[] = [
  { key: 'shop_name', label: 'Shop name', group: 'Customer', aliases: ['shop name', 'shop', 'customer name', 'customer', 'store name', 'store', 'outlet', 'name'] },
  { key: 'code', label: 'Customer code', group: 'Customer', aliases: ['customer code', 'code', 'cust code', 'account no', 'account number'] },
  { key: 'business_type', label: 'Business type', group: 'Customer', aliases: ['business type', 'biz type', 'type', 'category', 'channel'] },
  { key: 'remarks', label: 'Remarks', group: 'Customer', aliases: ['remarks', 'remark', 'notes', 'note', 'comments'] },
  { key: 'salesperson', label: 'Salesperson', group: 'Customer', aliases: ['salesperson', 'sales person', 'sales rep', 'owner', 'assigned to', 'sale'] },
  { key: 'contact_name', label: 'Contact name', group: 'Contact', aliases: ['contact name', 'contact', 'owner name', 'contact person'] },
  { key: 'phone', label: 'Phone', group: 'Contact', aliases: ['phone', 'phone number', 'tel', 'telephone', 'mobile', 'contact number'] },
  { key: 'province', label: 'Province', group: 'Address', aliases: ['province', 'province id', 'province code', 'city', 'province city', 'khet'] },
  { key: 'district', label: 'District', group: 'Address', aliases: ['district', 'khan', 'srok'] },
  { key: 'commune', label: 'Commune', group: 'Address', aliases: ['commune', 'sangkat', 'khum'] },
  { key: 'street_address', label: 'Street address', group: 'Address', aliases: ['address', 'street address', 'street', 'location'] },
  { key: 'landmark', label: 'Landmark', group: 'Address', aliases: ['landmark', 'near'] },
  { key: 'zipcode', label: 'Zip code', group: 'Address', aliases: ['zipcode', 'zip code', 'zip', 'postal code', 'postcode'] },
  { key: 'lat_long', label: 'Map pin (lat, long)', group: 'Address', aliases: ['lat long', 'latlong', 'lat lng', 'latitude longitude', 'gps', 'coordinates', 'map pin'] },
  { key: 'credit_limit', label: 'Credit limit', group: 'Sales', aliases: ['credit limit', 'credit', 'limit'] },
  { key: 'last_purchase_date', label: 'Last purchase date', group: 'Sales', aliases: ['last purchase date', 'last purchase', 'last order date', 'last order', 'last invoice date', 'last sale', 'invoice date', 'date'] },
  { key: 'balance', label: 'Balance', group: 'Sales', aliases: ['balance', 'customer balance', 'outstanding', 'outstanding balance', 'amount due', 'due', 'ar', 'receivable', 'debt', 'owing'] },
]

export const KEY_ALIASES = ['row id', 'rowid', 'id', 'key', 'customer id', 'sheet id', 'uuid', 'unique id']

export type KeyMatch = 'sheet_id' | 'code'
export type DateOrder = 'dmy' | 'mdy'

/** One contact slot: each row's phone in this column becomes its own contact (sheet_id = row ID + "#" + slot). */
export interface ContactSlot {
  phone: string
  /** The column holding the contact's name; empty cells use fallback. */
  label: string | null
  fallback: string
}

export const MAX_CONTACTS = 3

export interface TabConfig {
  url: string
  /** The tab's name, when the link has no #gid=. */
  tab?: string | null
  key: { column: string; matches: KeyMatch }
  fields: Partial<Record<FieldKey, string | null>>
  /** Up to three phones per row, each kept as its own contact. Needs key.matches = 'sheet_id'. */
  contacts?: ContactSlot[]
  /** Several rows for one customer: 'total' keeps the last balance, 'sum' adds them up. */
  balance_rows?: 'total' | 'sum'
}

/** Lowercase, no punctuation, single spaces: "Customer_ID " -> "customer id". */
export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[_\-./#:()]+/g, ' ')
    .replace(/[^\p{L}\p{M}\p{N} ]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Best guess of the key column and field columns from a header row. */
export function suggestMapping(headers: string[]): { key: string | null; fields: Partial<Record<FieldKey, string>>; contacts: ContactSlot[] } {
  const byNorm = new Map<string, string>()
  for (const h of headers) if (h.trim() && !byNorm.has(normHeader(h))) byNorm.set(normHeader(h), h)
  const used = new Set<string>()
  const pick = (aliases: string[]) => {
    for (const a of aliases) {
      const h = byNorm.get(a)
      if (h && !used.has(h)) {
        used.add(h)
        return h
      }
    }
    return null
  }
  const key = pick(KEY_ALIASES)
  // Numbered phones ("PH1" + "PH1L", "Phone 2" + "Phone 2 name") become contact slots.
  const contacts: ContactSlot[] = []
  for (let n = 1; n <= MAX_CONTACTS; n++) {
    const phone = pick([`ph${n}`, `phone${n}`, `phone ${n}`, `tel${n}`, `tel ${n}`, `mobile ${n}`])
    if (!phone) continue
    const label = pick([`ph${n}l`, `ph${n} label`, `ph${n} name`, `phone ${n} label`, `phone ${n} name`, `phone${n} name`, `contact ${n}`, `contact${n}`, `name ${n}`])
    contacts.push({ phone, label, fallback: `Phone ${n}` })
  }
  const fields: Partial<Record<FieldKey, string>> = {}
  // Specific names first so "Customer code" isn't taken by shop_name's "customer".
  const order: FieldKey[] = ['code', 'balance', 'last_purchase_date', 'credit_limit', 'contact_name', 'phone', 'province', 'district', 'commune', 'street_address', 'landmark', 'zipcode', 'lat_long', 'remarks', 'business_type', 'salesperson', 'shop_name']
  for (const k of order) {
    if (contacts.length && (k === 'contact_name' || k === 'phone')) continue
    const def = FIELDS.find((f) => f.key === k)!
    const h = pick(def.aliases)
    if (h) fields[k] = h
  }
  return { key, fields, contacts }
}

/** RFC 4180 CSV: quoted cells, doubled quotes, commas and newlines inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** The spreadsheet ID in a Google Sheets link; null when it isn't one. */
export function sheetId(url: string): string | null {
  return url.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)?.[1] ?? null
}

/** The #gid= in a link, when it has one. */
export function linkGid(url: string): string | null {
  return url.match(/[#&?]gid=(\d+)/)?.[1] ?? null
}

/** A Google Sheets link (any form) -> its CSV export URL for that tab (or gid); null when it isn't one. */
export function sheetCsvUrl(url: string, gid?: string | null): string | null {
  const id = sheetId(url)
  if (!id) return null
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid ?? linkGid(url) ?? '0'}`
}

/** A sheet's htmlview page -> the gid of the tab with this name (case and spacing ignored); null when none. */
export function gidForTab(html: string, name: string): string | null {
  const want = name.trim().replace(/\s+/g, ' ').toLowerCase()
  const unescape = (t: string) => t.replace(/\\u0026|&amp;/g, '&').replace(/&#39;|\\u0027/g, "'").replace(/&quot;|\\"/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  const same = (t: string) => unescape(t).trim().replace(/\s+/g, ' ').toLowerCase() === want
  // Tab buttons: <li id="sheet-button-123"><a ...>Name</a></li>
  for (const m of html.matchAll(/id="sheet-button-(\d+)"[^>]*>(?:\s*<[^>]+>)*\s*([^<]+?)\s*</g)) if (same(m[2])) return m[1]
  // Script data: items.push({name: "Name", ..., gid: "123"
  for (const m of html.matchAll(/name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g)) if (same(m[1])) return m[2]
  return null
}

/** "11.047996, 103.803276" -> { lat, lng }; null when empty or 0, 0 (no pin); undefined when unreadable or out of range. */
export function parseLatLong(raw: string): { lat: number; lng: number } | null | undefined {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(/^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/)
  if (!m) return undefined
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (lat === 0 && lng === 0) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  return { lat, lng }
}

/** "$1,240.50", "1 240", "(120)" -> -120, "USD 5" -> 5; "", "-" -> null; anything else -> NaN. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim()
  if (!s || s === '-' || s === '—') return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  s = s.replace(/usd|us\$|\$|៛|khr|riel/gi, '').replace(/[\s,]/g, '')
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  const n = Math.round(Number(s) * 100) / 100
  return neg ? -n : n
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 100) y += 2000
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

/** A sheet date -> "YYYY-MM-DD": ISO, d/m/y or m/d/y (by order), "30-Sep-2026", "Sep 30, 2026", Google serial numbers. "" -> null; unreadable -> undefined. */
export function parseDate(raw: string, order: DateOrder): string | null | undefined {
  const s = raw.trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3]) ?? undefined
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]]
    return (order === 'dmy' ? iso(y, b, a) : iso(y, a, b)) ?? undefined
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s,-]+(\d{2,4})$/)
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    return mi < 0 ? undefined : iso(+m[3], mi + 1, +m[1]) ?? undefined
  }
  m = s.match(/^([A-Za-z]{3,})[\s-](\d{1,2}),?[\s-](\d{2,4})$/)
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    return mi < 0 ? undefined : iso(+m[3], mi + 1, +m[2]) ?? undefined
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s))
    if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10)
  }
  return undefined
}

/** One sheet row, mapped: raw text for province / salesperson (resolved against the database later). */
export interface MappedRow {
  key: string
  matches: KeyMatch
  shop_name?: string
  code?: string
  business_type?: string
  contact_name?: string
  phone?: string
  province?: string
  district?: string
  commune?: string
  street_address?: string
  landmark?: string
  zipcode?: string
  remarks?: string
  latitude?: number
  longitude?: number
  credit_limit?: number
  salesperson?: string
  last_purchase_date?: string
  balance_usd?: number
  /** Contact slots with a phone: slot 1-3, name (or the slot's fallback), phone. */
  contacts?: { slot: number; name: string; phone: string }[]
}

export interface RowProblem {
  tab: number
  row: number
  reason: string
}

const TEXT_FIELDS: FieldKey[] = ['shop_name', 'code', 'business_type', 'contact_name', 'phone', 'province', 'district', 'commune', 'street_address', 'landmark', 'zipcode', 'remarks', 'salesperson']
const MERGED_FIELDS = [...TEXT_FIELDS, 'credit_limit', 'latitude', 'longitude'] as const

/**
 * Map one tab's CSV rows (header first) to customer fields. Missing headers
 * stop the tab (missing lists them); unreadable money or dates drop that cell
 * and are reported; rows without a key are reported unless entirely blank.
 */
export function mapTab(rows: string[][], tab: TabConfig, tabNo: number, order: DateOrder): { rows: MappedRow[]; problems: RowProblem[]; missing: string[] } {
  const header = (rows[0] ?? []).map((h) => h.trim())
  const col = (name: string | null | undefined) => (name ? header.findIndex((h) => h === name.trim() || normHeader(h) === normHeader(name)) : -1)
  const keyAt = col(tab.key.column)
  const at: [FieldKey, number][] = []
  const missing: string[] = []
  if (keyAt < 0) missing.push(tab.key.column)
  for (const [k, h] of Object.entries(tab.fields) as [FieldKey, string | null][]) {
    if (!h) continue
    const i = col(h)
    if (i < 0) missing.push(h)
    else at.push([k, i])
  }
  const slots: { slot: number; phone: number; label: number; fallback: string }[] = []
  ;(tab.contacts ?? []).slice(0, MAX_CONTACTS).forEach((c, n) => {
    const phone = col(c.phone)
    const label = col(c.label)
    if (phone < 0) missing.push(c.phone)
    if (c.label && label < 0) missing.push(c.label)
    slots.push({ slot: n + 1, phone, label, fallback: c.fallback?.trim() || `Phone ${n + 1}` })
  })
  if (missing.length) return { rows: [], problems: [], missing }

  const out: MappedRow[] = []
  const problems: RowProblem[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const key = (cells[keyAt] ?? '').trim()
    if (!key) {
      if (cells.some((c) => c.trim())) problems.push({ tab: tabNo, row: r + 1, reason: `No ${tab.key.column}` })
      continue
    }
    const m: MappedRow = { key, matches: tab.key.matches }
    for (const [k, i] of at) {
      const v = (cells[i] ?? '').trim()
      if (!v) continue
      if (TEXT_FIELDS.includes(k)) {
        ;(m as unknown as Record<string, string>)[k] = v
      } else if (k === 'balance' || k === 'credit_limit') {
        const n = parseMoney(v)
        if (n === null) continue
        if (Number.isNaN(n)) problems.push({ tab: tabNo, row: r + 1, reason: `“${v}” in ${header[i]} isn’t an amount` })
        else if (k === 'balance') m.balance_usd = n
        else m.credit_limit = n
      } else if (k === 'last_purchase_date') {
        const d = parseDate(v, order)
        if (d === undefined) problems.push({ tab: tabNo, row: r + 1, reason: `“${v}” in ${header[i]} isn’t a date` })
        else if (d) m.last_purchase_date = d
      } else if (k === 'lat_long') {
        const p = parseLatLong(v)
        if (p === undefined) problems.push({ tab: tabNo, row: r + 1, reason: `“${v}” in ${header[i]} isn’t a map pin (lat, long)` })
        else if (p) {
          m.latitude = p.lat
          m.longitude = p.lng
        }
      }
    }
    for (const s of slots) {
      const phone = (cells[s.phone] ?? '').trim()
      if (!phone) continue
      const name = s.label >= 0 ? (cells[s.label] ?? '').trim() : ''
      ;(m.contacts ??= []).push({ slot: s.slot, name: name || s.fallback, phone })
    }
    out.push(m)
  }
  return { rows: out, problems, missing }
}

const mergeKey = (r: MappedRow) => `${r.matches}:${r.matches === 'code' ? r.key.toLowerCase() : r.key}`

/**
 * Merge mapped rows from every tab into one row per customer key. Text fields
 * (and the map pin, and each contact slot) keep the first value seen; last_purchase_date keeps the latest; balance is
 * summed within a tab whose balance_rows is 'sum', else the last value wins.
 */
export function mergeRows(tabs: { rows: MappedRow[]; balanceRows?: 'total' | 'sum' }[]): MappedRow[] {
  const merged = new Map<string, MappedRow>()
  for (const t of tabs) {
    const tabBalance = new Map<string, number>()
    for (const r of t.rows) {
      const k = mergeKey(r)
      const cur = merged.get(k) ?? { key: r.key, matches: r.matches }
      for (const f of MERGED_FIELDS) {
        const v = (r as unknown as Record<string, unknown>)[f]
        if (v !== undefined && (cur as unknown as Record<string, unknown>)[f] === undefined) (cur as unknown as Record<string, unknown>)[f] = v
      }
      for (const c of r.contacts ?? []) {
        if (!cur.contacts?.some((x) => x.slot === c.slot)) (cur.contacts ??= []).push(c)
      }
      if (r.last_purchase_date && (!cur.last_purchase_date || r.last_purchase_date > cur.last_purchase_date)) cur.last_purchase_date = r.last_purchase_date
      if (r.balance_usd !== undefined) {
        const b = t.balanceRows === 'sum' ? (tabBalance.get(k) ?? 0) + r.balance_usd : r.balance_usd
        tabBalance.set(k, Math.round(b * 100) / 100)
      }
      merged.set(k, cur)
    }
    for (const [k, b] of tabBalance) merged.get(k)!.balance_usd = b
  }
  return [...merged.values()]
}

const fold = (s: string) => normHeader(s).replace(/\s+(province|city|khet|ខេត្ត|ក្រុង)$/u, '').replace(/^(province of|khet|ខេត្ត|ក្រុង)\s*/u, '')

/** A province cell -> geo_provinces code (code, English or Khmer name, case and spacing ignored); null when unknown. */
export function resolveProvince(raw: string | undefined, provinces: { code: string; name: string; name_alt: string | null }[]): string | null {
  if (!raw) return null
  const v = fold(raw)
  const vCompact = v.replace(/\s/g, '')
  for (const p of provinces) {
    if (p.code.toLowerCase() === raw.trim().toLowerCase()) return p.code
    for (const n of [p.name, p.name_alt]) {
      if (!n) continue
      const f = fold(n)
      if (f === v || f.replace(/\s/g, '') === vCompact) return p.code
    }
  }
  return null
}

/** A salesperson cell -> an active user's id by full name, nickname or email; null when none or several match. */
export function resolveUser(raw: string | undefined, users: { id: string; full_name: string | null; nickname: string | null; email: string | null }[]): string | null {
  if (!raw) return null
  const v = normHeader(raw)
  const hits = users.filter((u) => [u.full_name, u.nickname, u.email].some((x) => x && normHeader(x) === v))
  return hits.length === 1 ? hits[0].id : null
}

// ---------------------------------------------------------------- sale orders

export type OrderKey =
  | 'sheet_id' | 'order_no' | 'assign_to' | 'customer_sheet_id' | 'order_date' | 'delivery_date' | 'is_khr' | 'note'
  | 'delivery_request' | 'truck_id' | 'cartons' | 'order_status' | 'approved' | 'stock_checked' | 'approved_by'
  | 'approved_at' | 'created_by' | 'created_at' | 'modified_by' | 'modified_at' | 'payment_term' | 'so_type'
  | 'lat_long' | 'distance' | 'value'

/** The sale order sheet's columns (tab SO), by header; the first five must be there. */
export const ORDER_COLUMNS: [OrderKey, string][] = [
  ['sheet_id', 'ID'],
  ['order_no', 'ORDER_NUMBER'],
  ['customer_sheet_id', 'CUSTOMER_ID'],
  ['order_status', 'ORDER_STATUS'],
  ['approved', 'APPROVED'],
  ['assign_to', 'ASSIGN_TO'],
  ['order_date', 'ORDER_DATE'],
  ['delivery_date', 'DL_DATE'],
  ['is_khr', 'IS_KHR'],
  ['note', 'REMARKS'],
  ['delivery_request', 'DL_REQ'],
  ['truck_id', 'TRUCK_ID'],
  ['cartons', 'NUMBER_OF_CTN'],
  ['stock_checked', 'STOCK_CHECKED'],
  ['approved_by', 'APPROVED_BY'],
  ['approved_at', 'APPROVED_TS'],
  ['created_by', 'CR'],
  ['created_at', 'CRTS'],
  ['modified_by', 'MD'],
  ['modified_at', 'MDTS'],
  ['payment_term', 'PAYMENT_TERM'],
  ['so_type', 'SO_TYPE'],
  ['lat_long', 'LAT/LONG'],
  ['distance', 'DISTANCE'],
  ['value', 'SO_VALUE'],
]
const ORDER_REQUIRED = 5

/** TRUE / FALSE as Google exports them, plus 1/0, yes/no, ✓; "" -> null; anything else -> undefined. */
export function parseBool(raw: string): boolean | null | undefined {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (['true', '1', 'yes', 'y', '✓', '✔', 'x'].includes(s)) return true
  if (['false', '0', 'no', 'n'].includes(s)) return false
  return undefined
}

/** A sheet date and time ("26/08/2021 23:55:53") -> ISO in Phnom Penh time; a plain date is midnight. "" -> null; unreadable -> undefined. */
export function parseDateTime(raw: string, order: DateOrder): string | null | undefined {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(/^(.+?)[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i)
  const d = parseDate(m ? m[1] : s, order)
  if (!d) return undefined
  let h = m ? +m[2] : 0
  const min = m ? +m[3] : 0
  const sec = m?.[4] ? +m[4] : 0
  if (m?.[5]) h = (h % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0)
  if (h > 23 || min > 59 || sec > 59) return undefined
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d}T${p(h)}:${p(min)}:${p(sec)}+07:00`
}

/** One sale order row, parsed. assign_to is the raw name list ("pheakdey , seyha"). */
export interface OrderRow {
  sheet_id: string
  order_no: string | null
  customer_sheet_id: string | null
  order_status: number | null
  approved: boolean
  assign_to: string | null
  order_date: string | null
  delivery_date: string | null
  is_khr: boolean
  note: string | null
  delivery_request: string | null
  truck_id: string | null
  cartons: number | null
  stock_checked: boolean
  approved_by: string | null
  approved_at: string | null
  created_by: string | null
  created_at: string | null
  modified_by: string | null
  modified_at: string | null
  payment_term: string | null
  so_type: string | null
  latitude: number | null
  longitude: number | null
  distance: number | null
  value: number | null
}

/** A valid order: ORDER_STATUS = 1 and APPROVED = TRUE. */
export const isValidOrder = (r: Pick<OrderRow, 'order_status' | 'approved'>) => r.order_status === 1 && r.approved

/**
 * Map the sale order tab's CSV rows (header first). Missing required headers
 * stop it (missing lists them); optional columns may be absent. Unreadable
 * cells are dropped and reported only on valid orders; rows without an ID are
 * reported unless blank. A repeated ID keeps its last row.
 */
export function mapOrders(rows: string[][], order: DateOrder, tabNo = 0): { rows: OrderRow[]; problems: RowProblem[]; missing: string[] } {
  const header = (rows[0] ?? []).map((h) => h.trim())
  const at = new Map<OrderKey, number>()
  const missing: string[] = []
  ORDER_COLUMNS.forEach(([k, h], i) => {
    const idx = header.findIndex((x) => x === h || normHeader(x) === normHeader(h))
    if (idx >= 0) at.set(k, idx)
    else if (i < ORDER_REQUIRED) missing.push(h)
  })
  if (missing.length) return { rows: [], problems: [], missing }

  const byId = new Map<string, OrderRow>()
  const problems: RowProblem[] = []
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    const cell = (k: OrderKey) => {
      const i = at.get(k)
      return i === undefined ? '' : (cells[i] ?? '').trim()
    }
    const id = cell('sheet_id')
    if (!id) {
      if (cells.some((c) => c.trim())) problems.push({ tab: tabNo, row: r + 1, reason: 'No ID' })
      continue
    }
    const status = cell('order_status')
    const o: OrderRow = {
      sheet_id: id,
      order_no: cell('order_no') || null,
      customer_sheet_id: cell('customer_sheet_id') || null,
      order_status: /^-?\d+(\.0+)?$/.test(status) ? parseInt(status, 10) : null,
      approved: parseBool(cell('approved')) === true,
      assign_to: cell('assign_to') || null,
      order_date: null,
      delivery_date: null,
      is_khr: parseBool(cell('is_khr')) === true,
      note: cell('note') || null,
      delivery_request: cell('delivery_request') || null,
      truck_id: cell('truck_id') || null,
      cartons: null,
      stock_checked: parseBool(cell('stock_checked')) === true,
      approved_by: cell('approved_by') || null,
      approved_at: null,
      created_by: cell('created_by') || null,
      created_at: null,
      modified_by: cell('modified_by') || null,
      modified_at: null,
      payment_term: cell('payment_term') || null,
      so_type: cell('so_type') || null,
      latitude: null,
      longitude: null,
      distance: null,
      value: null,
    }
    const valid = isValidOrder(o)
    const bad = (k: OrderKey, what: string) => {
      if (valid) problems.push({ tab: tabNo, row: r + 1, reason: `“${cell(k)}” in ${header[at.get(k)!]} isn’t ${what}` })
    }
    for (const k of ['order_date', 'delivery_date'] as const) {
      const d = parseDate(cell(k), order)
      if (d === undefined) bad(k, 'a date')
      else o[k] = d
    }
    for (const k of ['approved_at', 'created_at', 'modified_at'] as const) {
      const d = parseDateTime(cell(k), order)
      if (d === undefined) bad(k, 'a date and time')
      else o[k] = d
    }
    for (const k of ['cartons', 'distance', 'value'] as const) {
      const n = parseMoney(cell(k))
      if (Number.isNaN(n)) bad(k, k === 'value' ? 'an amount' : 'a number')
      else o[k] = n
    }
    const pin = parseLatLong(cell('lat_long'))
    if (pin === undefined) bad('lat_long', 'a map pin (lat, long)')
    else if (pin) {
      o.latitude = pin.lat
      o.longitude = pin.lng
    }
    byId.set(id, o)
  }
  return { rows: [...byId.values()], problems, missing }
}

/** "pheakdey , seyha" -> the first name that is exactly one active user; null when none is. */
export function resolveAssignee(raw: string | null, users: { id: string; full_name: string | null; nickname: string | null; email: string | null }[]): string | null {
  for (const name of (raw ?? '').split(/[,;/]/)) {
    const id = resolveUser(name.trim() || undefined, users)
    if (id) return id
  }
  return null
}
