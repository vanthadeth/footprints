// Footprints sheet sync: pure helpers (no Deno APIs) so vitest can test them
// from the app side. The Edge Function (index.ts) fetches the CSV and talks
// to the database; everything about reading cells lives here.

export type FieldKey =
  | 'shop_name' | 'code' | 'business_type' | 'contact_name' | 'phone'
  | 'province' | 'district' | 'commune' | 'street_address' | 'landmark'
  | 'credit_limit' | 'salesperson' | 'last_purchase_date' | 'balance'

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
  { key: 'business_type', label: 'Business type', group: 'Customer', aliases: ['business type', 'type', 'category', 'channel'] },
  { key: 'salesperson', label: 'Salesperson', group: 'Customer', aliases: ['salesperson', 'sales person', 'sales rep', 'owner', 'assigned to', 'sale'] },
  { key: 'contact_name', label: 'Contact name', group: 'Contact', aliases: ['contact name', 'contact', 'owner name', 'contact person'] },
  { key: 'phone', label: 'Phone', group: 'Contact', aliases: ['phone', 'phone number', 'tel', 'telephone', 'mobile', 'contact number'] },
  { key: 'province', label: 'Province', group: 'Address', aliases: ['province', 'city', 'province city', 'khet'] },
  { key: 'district', label: 'District', group: 'Address', aliases: ['district', 'khan', 'srok'] },
  { key: 'commune', label: 'Commune', group: 'Address', aliases: ['commune', 'sangkat', 'khum'] },
  { key: 'street_address', label: 'Street address', group: 'Address', aliases: ['address', 'street address', 'street', 'location'] },
  { key: 'landmark', label: 'Landmark', group: 'Address', aliases: ['landmark', 'near'] },
  { key: 'credit_limit', label: 'Credit limit', group: 'Sales', aliases: ['credit limit', 'credit', 'limit'] },
  { key: 'last_purchase_date', label: 'Last purchase date', group: 'Sales', aliases: ['last purchase date', 'last purchase', 'last order date', 'last order', 'last invoice date', 'last sale', 'invoice date', 'date'] },
  { key: 'balance', label: 'Balance', group: 'Sales', aliases: ['balance', 'customer balance', 'outstanding', 'outstanding balance', 'amount due', 'due', 'ar', 'receivable', 'debt', 'owing'] },
]

export const KEY_ALIASES = ['row id', 'rowid', 'id', 'key', 'customer id', 'sheet id', 'uuid', 'unique id']

export type KeyMatch = 'sheet_id' | 'code'
export type DateOrder = 'dmy' | 'mdy'

export interface TabConfig {
  url: string
  key: { column: string; matches: KeyMatch }
  fields: Partial<Record<FieldKey, string | null>>
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
export function suggestMapping(headers: string[]): { key: string | null; fields: Partial<Record<FieldKey, string>> } {
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
  const fields: Partial<Record<FieldKey, string>> = {}
  // Specific names first so "Customer code" isn't taken by shop_name's "customer".
  const order: FieldKey[] = ['code', 'balance', 'last_purchase_date', 'credit_limit', 'contact_name', 'phone', 'province', 'district', 'commune', 'street_address', 'landmark', 'business_type', 'salesperson', 'shop_name']
  for (const k of order) {
    const def = FIELDS.find((f) => f.key === k)!
    const h = pick(def.aliases)
    if (h) fields[k] = h
  }
  return { key, fields }
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

/** A Google Sheets link (any form) -> its CSV export URL for that tab; null when it isn't one. */
export function sheetCsvUrl(url: string): string | null {
  const m = url.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  if (!m) return null
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
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
  credit_limit?: number
  salesperson?: string
  last_purchase_date?: string
  balance_usd?: number
}

export interface RowProblem {
  tab: number
  row: number
  reason: string
}

const TEXT_FIELDS: FieldKey[] = ['shop_name', 'code', 'business_type', 'contact_name', 'phone', 'province', 'district', 'commune', 'street_address', 'landmark', 'salesperson']

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
      }
    }
    out.push(m)
  }
  return { rows: out, problems, missing }
}

const mergeKey = (r: MappedRow) => `${r.matches}:${r.matches === 'code' ? r.key.toLowerCase() : r.key}`

/**
 * Merge mapped rows from every tab into one row per customer key. Text fields
 * keep the first value seen; last_purchase_date keeps the latest; balance is
 * summed within a tab whose balance_rows is 'sum', else the last value wins.
 */
export function mergeRows(tabs: { rows: MappedRow[]; balanceRows?: 'total' | 'sum' }[]): MappedRow[] {
  const merged = new Map<string, MappedRow>()
  for (const t of tabs) {
    const tabBalance = new Map<string, number>()
    for (const r of t.rows) {
      const k = mergeKey(r)
      const cur = merged.get(k) ?? { key: r.key, matches: r.matches }
      for (const f of [...TEXT_FIELDS, 'credit_limit'] as const) {
        const v = (r as unknown as Record<string, unknown>)[f]
        if (v !== undefined && (cur as unknown as Record<string, unknown>)[f] === undefined) (cur as unknown as Record<string, unknown>)[f] = v
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
