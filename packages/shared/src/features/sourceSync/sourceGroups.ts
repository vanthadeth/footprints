import type { Source } from './sources'

export type GroupKey = 'engine' | 'customers' | 'products' | 'places' | 'other'

export interface SourceGroup {
  key: GroupKey
  title: string
  sources: Source[]
}

const GROUPS: [GroupKey, string][] = [
  ['engine', 'Invoices & payments'],
  ['customers', 'Customers'],
  ['products', 'Products'],
  ['places', 'Places'],
  ['other', 'Other'],
]

const CUSTOMER_TABLES = new Set(['customers', 'customer_contacts'])
const PRODUCT_TABLES = new Set(['items', 'item_variants', 'item_categories', 'brands'])

/** Which group a source is shown in: a source with any mapping on the Footprints engine is "new"; the rest go by the tables they feed. */
export function groupOf(source: Source): GroupKey {
  if (source.mappings.some((m) => m.engine === 'footprints')) return 'engine'
  const tables = source.mappings.map((m) => m.targetTable)
  if (tables.some((t) => CUSTOMER_TABLES.has(t))) return 'customers'
  if (tables.some((t) => PRODUCT_TABLES.has(t))) return 'products'
  if (tables.some((t) => t.startsWith('geo_'))) return 'places'
  return 'other'
}

/** Sources by group, in a fixed group order and A-Z inside; empty groups are left out. */
export function groupSources(sources: Source[]): SourceGroup[] {
  return GROUPS.map(([key, title]) => ({
    key,
    title,
    sources: sources.filter((s) => groupOf(s) === key).sort((a, b) => a.tabName.localeCompare(b.tabName)),
  })).filter((g) => g.sources.length > 0)
}

export type ChipTone = 'ok' | 'warn' | 'neutral'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** The status chip of a source: on the Footprints engine it says whether it has ever run; otherwise it is the older runner's. */
export function sourceChip(source: Source): { text: string; tone: ChipTone } {
  const moved = source.mappings.filter((m) => m.engine === 'footprints')
  if (!moved.length) return { text: 'Older runner', tone: 'neutral' }
  const last = moved.map((m) => m.lastRunAt).filter((x): x is string => !!x).sort().pop()
  return last ? { text: `Synced ${day(last)}`, tone: 'ok' } : { text: 'Not synced yet', tone: 'warn' }
}

/** "Invoices", "Customers and 3 more": the tables a source feeds, for its row's second line. */
export function targetsText(source: Source): string {
  const names = [...new Set(source.mappings.map((m) => m.name))]
  if (names.length <= 2) return names.join(' and ')
  return `${names[0]} and ${names.length - 1} more`
}
