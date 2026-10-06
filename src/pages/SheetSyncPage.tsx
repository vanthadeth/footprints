import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronRight, Phone, Plus, ReceiptText, RefreshCw, Sheet, Trash2, X } from 'lucide-react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useProfile } from '@/features/auth/useProfile'
import { sheetSyncService } from '@/features/sheetSync/sheetSyncService'
import {
  FIELD_GROUPS,
  FIELDS,
  MAX_CONTACTS,
  SCHEDULES,
  WEEKDAYS,
  countsText,
  missingOrderColumns,
  newContact,
  newTab,
  orderCountsText,
  orderTabProblem,
  scheduleText,
  tabProblem,
  whenText,
  type ContactSlot,
  type DateOrder,
  type FieldKey,
  type OrderTab,
  type Schedule,
  type SheetCheck,
  type SheetSyncRun,
  type SheetSyncSettings,
  type SyncResult,
  type TabConfig,
} from '@/features/sheetSync/sheetSync'

const card = 'rounded-2xl bg-white shadow-card'
const kicker = 'text-[12px] font-extrabold uppercase tracking-wide text-neutral-500'
const select = 'h-10 w-full min-w-0 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-semibold text-neutral-900 dark:border-neutral-700'
const input = 'h-10 w-full min-w-0 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700'

const RUN_STATUS: Record<SheetSyncRun['status'], { label: string; tone: string }> = {
  ok: { label: 'Done', tone: 'bg-status-working/10 text-status-working' },
  partial: { label: 'Done, with problems', tone: 'bg-status-warn/10 text-status-warn' },
  failed: { label: 'Failed', tone: 'bg-status-danger/10 text-status-danger' },
  running: { label: 'Running', tone: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' },
}
const TRIGGER: Record<SheetSyncRun['trigger'], string> = { manual: 'Sync now', schedule: 'Scheduled', preview: 'Preview' }

/** A header picker: the sheet's headers once checked, else just the saved name. */
function HeaderSelect({ value, headers, onChange, label, allowNone = true }: { value: string | null | undefined; headers: string[] | undefined; onChange: (v: string | null) => void; label: string; allowNone?: boolean }) {
  const options = [...new Set([...(headers ?? []), ...(value ? [value] : [])])]
  return (
    <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={`${select} ${value ? '' : 'text-neutral-400'}`}>
      {allowNone ? <option value="">— not synced —</option> : <option value="">Choose a column…</option>}
      {options.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  )
}

function TabCard({ n, tab, check, checking, onChange, onCheck, onRemove }: {
  n: number
  tab: TabConfig
  check: SheetCheck | undefined
  checking: boolean
  onChange: (t: TabConfig) => void
  onCheck: () => void
  onRemove?: () => void
}) {
  const headers = check?.ok ? check.headers : undefined
  // A tab that's already mapped shows just its columns; "Show all fields" opens the rest.
  const [allFields, setAllFields] = useState(() => !Object.values(tab.fields).some(Boolean))
  const mappedCount = Object.values(tab.fields).filter(Boolean).length
  const setField = (k: FieldKey, v: string | null) => onChange({ ...tab, fields: { ...tab.fields, [k]: v } })
  const contacts = tab.contacts ?? []
  const setContacts = (cs: ContactSlot[]) => onChange({ ...tab, contacts: cs })
  const setContact = (i: number, c: Partial<ContactSlot>) => setContacts(contacts.map((x, j) => (j === i ? { ...x, ...c } : x)))
  const col = (name: string | null | undefined) => (name && headers ? headers.indexOf(name) : -1)
  const sample = check?.ok ? (check.sample ?? []).slice(0, 3) : []
  const shown: FieldKey[] = (['shop_name', 'balance', 'last_purchase_date'] as FieldKey[]).filter((k) => tab.fields[k])
  return (
    <section className={`${card} space-y-3 p-3.5`} aria-label={`Sheet tab ${n}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-status-working text-white">
          <Sheet className="h-4 w-4" aria-hidden />
        </span>
        <p className="flex-1 text-[15px] font-extrabold text-neutral-900">Sheet tab {n}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove sheet tab ${n}`} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-[12.5px] font-bold text-neutral-600" htmlFor={`sheet-url-${n}`}>
          Link to the tab
        </label>
        <div className="flex gap-2">
          <input
            id={`sheet-url-${n}`}
            value={tab.url}
            onChange={(e) => onChange({ ...tab, url: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=0"
            inputMode="url"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700"
          />
          <button type="button" onClick={onCheck} disabled={checking || !tab.url.trim()} className="h-10 shrink-0 rounded-lg bg-brand-50 px-3 text-sm font-extrabold text-brand-700 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-200">
            {checking ? 'Checking…' : 'Check sheet'}
          </button>
        </div>
        <p className="text-[12px] leading-snug text-neutral-500">Open the tab in Google Sheets and copy the link from the address bar, so it includes that tab’s #gid — or type the tab’s name below.</p>
        <label className="flex items-center gap-2">
          <span className="w-[108px] shrink-0 text-[13px] font-semibold text-neutral-700">Tab name</span>
          <input
            value={tab.tab ?? ''}
            onChange={(e) => onChange({ ...tab, tab: e.target.value || null })}
            placeholder="Optional, e.g. CUS"
            autoComplete="off"
            aria-label="Tab name"
            className={input}
          />
        </label>
        {check && !check.ok && <p className="rounded-lg bg-status-danger/10 px-2.5 py-1.5 text-[12.5px] text-status-danger">{check.error}</p>}
        {check?.ok && (
          <p className="text-[12.5px] font-semibold text-status-working">
            Found {check.rows?.toLocaleString('en-US')} rows · {headers?.length} columns
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-[12.5px] font-bold text-neutral-600">Which column identifies each customer?</p>
        <HeaderSelect label="Key column" value={tab.key.column} headers={headers} allowNone={false} onChange={(v) => onChange({ ...tab, key: { ...tab.key, column: v ?? '' } })} />
        <SegmentedControl
          shape="tabs"
          ariaLabel="The key column holds"
          value={tab.key.matches}
          onChange={(v) => onChange({ ...tab, key: { ...tab.key, matches: v } })}
          options={[
            { value: 'sheet_id', label: 'Sheet row ID' },
            { value: 'code', label: 'Customer code' },
          ]}
        />
      </div>

      {FIELD_GROUPS.filter((g) => allFields || FIELDS.some((f) => f.group === g && tab.fields[f.key])).map((g) => (
        <div key={g} className="space-y-1.5">
          <p className={kicker}>{g === 'Sales' ? 'Last purchase & balance' : g}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {FIELDS.filter((f) => f.group === g && (allFields || tab.fields[f.key])).map((f) => (
              <label key={f.key} className="flex items-center gap-2">
                <span className="w-[108px] shrink-0 text-[13px] font-semibold text-neutral-700">{f.label}</span>
                <HeaderSelect label={f.label} value={tab.fields[f.key]} headers={headers} onChange={(v) => setField(f.key, v)} />
              </label>
            ))}
          </div>
        </div>
      ))}

      {mappedCount > 0 && (
        <button type="button" onClick={() => setAllFields(!allFields)} className="text-[13px] font-extrabold text-brand-600">
          {allFields ? `Show only the ${mappedCount} synced column${mappedCount === 1 ? '' : 's'}` : `Show all ${FIELDS.length} fields`}
        </button>
      )}

      <div className="space-y-1.5">
        <p className={kicker}>Contacts</p>
        {contacts.length === 0 && <p className="text-[12.5px] leading-snug text-neutral-500">Sync up to three phones per row, each as its own contact (e.g. PH1 + PH1L, PH2 + PH2L).</p>}
        {contacts.map((c, i) => (
          <div key={i} className="space-y-1.5 rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800" aria-label={`Contact ${i + 1}`} role="group">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-neutral-500" aria-hidden />
              <p className="flex-1 text-[13px] font-extrabold text-neutral-800">Contact {i + 1}</p>
              <button type="button" onClick={() => setContacts(contacts.filter((_, j) => j !== i))} aria-label={`Remove contact ${i + 1}`} className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="flex items-center gap-2">
              <span className="w-[108px] shrink-0 text-[13px] font-semibold text-neutral-700">Phone</span>
              <HeaderSelect label={`Contact ${i + 1} phone`} value={c.phone} headers={headers} allowNone={false} onChange={(v) => setContact(i, { phone: v ?? '' })} />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-[108px] shrink-0 text-[13px] font-semibold text-neutral-700">Name</span>
              <HeaderSelect label={`Contact ${i + 1} name`} value={c.label} headers={headers} onChange={(v) => setContact(i, { label: v })} />
            </label>
            <label className="flex items-center gap-2">
              <span className="w-[108px] shrink-0 text-[13px] font-semibold text-neutral-700">If no name</span>
              <input value={c.fallback} onChange={(e) => setContact(i, { fallback: e.target.value })} aria-label={`Contact ${i + 1} name when empty`} className={input} />
            </label>
          </div>
        ))}
        {contacts.length > 0 && (
          <p className="text-[12px] leading-snug text-neutral-500">
            Each phone becomes its own contact, kept in step by the row ID + #1, #2, #3. A row with no phone leaves that contact as it is.
            {tab.key.matches !== 'sheet_id' && <b className="text-status-danger"> Contacts need the key column to be the sheet row ID.</b>}
          </p>
        )}
        {contacts.length < MAX_CONTACTS && (
          <button type="button" onClick={() => setContacts([...contacts, newContact(contacts.length + 1)])} className="flex items-center gap-1 text-[13px] font-extrabold text-brand-600">
            <Plus className="h-4 w-4" /> Add contact
          </button>
        )}
      </div>

      {tab.fields.balance && (
        <div className="space-y-1.5">
          <p className="text-[12.5px] font-bold text-neutral-600">When a customer is on several rows, the balance is</p>
          <SegmentedControl
            shape="tabs"
            ariaLabel="Balance rows"
            value={tab.balance_rows ?? 'total'}
            onChange={(v) => onChange({ ...tab, balance_rows: v })}
            options={[
              { value: 'total', label: 'Their total' },
              { value: 'sum', label: 'Add up the rows' },
            ]}
          />
        </div>
      )}

      {sample.length > 0 && shown.length > 0 && (
        <div className="rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800">
          <p className={kicker}>First rows, as they’ll sync</p>
          {sample.map((row, i) => (
            <p key={i} className="mt-1 truncate text-[12.5px] text-neutral-700">
              <span className="font-bold">{row[col(tab.key.column)] || '—'}</span>
              {shown.map((k) => ` · ${row[col(tab.fields[k])] || '—'}`).join('')}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

/** The sale order tab: a link (and tab name), checked for the SO columns; only valid orders are imported. */
function OrdersCard({ orders, check, checking, onChange, onCheck }: {
  orders: OrderTab | null
  check: SheetCheck | undefined
  checking: boolean
  onChange: (o: OrderTab | null) => void
  onCheck: () => void
}) {
  const missing = check?.ok ? missingOrderColumns(check.headers ?? []) : []
  return (
    <section className={`${card} space-y-3 p-3.5`} aria-label="Sale orders">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
          <ReceiptText className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold text-neutral-900">Sale orders</p>
          <p className="text-[12px] text-neutral-500">{orders ? 'Synced after the customer tabs' : 'Not synced'}</p>
        </div>
        {orders ? (
          <button type="button" onClick={() => onChange(null)} aria-label="Stop syncing sale orders" className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => onChange({ url: '', tab: 'SO' })} className="flex h-9 items-center gap-1 rounded-lg bg-brand-50 px-3 text-sm font-extrabold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
            <Plus className="h-4 w-4" /> Add
          </button>
        )}
      </div>

      {orders && (
        <>
          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-bold text-neutral-600" htmlFor="sheet-orders-url">
              Link to the sale order sheet
            </label>
            <div className="flex gap-2">
              <input
                id="sheet-orders-url"
                value={orders.url}
                onChange={(e) => onChange({ ...orders, url: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                inputMode="url"
                autoComplete="off"
                className={`${input} flex-1`}
              />
              <button type="button" onClick={onCheck} disabled={checking || !orders.url.trim()} className="h-10 shrink-0 rounded-lg bg-brand-50 px-3 text-sm font-extrabold text-brand-700 disabled:opacity-50 dark:bg-brand-500/15 dark:text-brand-200">
                {checking ? 'Checking…' : 'Check sheet'}
              </button>
            </div>
            <label className="flex items-center gap-2">
              <span className="w-[108px] shrink-0 text-[13px] font-semibold text-neutral-700">Tab name</span>
              <input value={orders.tab ?? ''} onChange={(e) => onChange({ ...orders, tab: e.target.value || null })} placeholder="e.g. SO" autoComplete="off" aria-label="Sale order tab name" className={input} />
            </label>
            {check && !check.ok && <p className="rounded-lg bg-status-danger/10 px-2.5 py-1.5 text-[12.5px] text-status-danger">{check.error}</p>}
            {check?.ok &&
              (missing.length ? (
                <p className="rounded-lg bg-status-danger/10 px-2.5 py-1.5 text-[12.5px] text-status-danger">No column named {missing.map((m) => `“${m}”`).join(', ')} in that tab.</p>
              ) : (
                <p className="text-[12.5px] font-semibold text-status-working">Found {check.rows?.toLocaleString('en-US')} orders · all the SO columns are there</p>
              ))}
          </div>
          <ul className="space-y-1 rounded-xl bg-neutral-50 p-2.5 text-[12.5px] leading-snug text-neutral-700 dark:bg-neutral-800">
            <li>
              Only valid orders come in: <b>ORDER_STATUS = 1</b> and <b>APPROVED = TRUE</b>. An order that stops being valid is marked cancelled.
            </li>
            <li>Orders match by the sheet’s ID column; the customer by CUSTOMER_ID, the salesperson by the first ASSIGN_TO name that is a user.</li>
            <li>The sheet wins: changes there replace what’s in the app. Orders removed from the sheet are left alone.</li>
          </ul>
        </>
      )}
    </section>
  )
}

function ResultCard({ result, preview }: { result: SyncResult; preview: boolean }) {
  if (!result.ok)
    return (
      <p role="alert" className="flex gap-2 rounded-xl bg-status-danger/10 px-3 py-2.5 text-sm text-status-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {result.error}
      </p>
    )
  const c = result.counts!
  return (
    <div role="status" className={`${card} space-y-1.5 p-3.5`}>
      <p className="text-[15px] font-extrabold text-neutral-900">{preview ? 'Preview — nothing changed yet' : 'Synced'}</p>
      <p className="text-[13.5px] text-neutral-700">
        {c.rows_read.toLocaleString('en-US')} rows read · {countsText(c, preview)}
      </p>
      {orderCountsText(c.orders, preview) && <p className="text-[13.5px] text-neutral-700">{orderCountsText(c.orders, preview)}</p>}
      {(result.errors?.length ?? 0) > 0 && (
        <ul className="space-y-0.5 text-[12.5px] text-status-warn">
          {result.errors!.slice(0, 8).map((e, i) => (
            <li key={i}>
              {e.row ? `Tab ${e.tab}, row ${e.row}: ` : ''}
              {e.reason}
            </li>
          ))}
          {(result.errors!.length > 8 || (result.more_errors ?? 0) > 0) && <li>…and {result.errors!.length - 8 + (result.more_errors ?? 0)} more (see History)</li>}
        </ul>
      )}
    </div>
  )
}

/**
 * Google Sheet sync (Super Admin, Company setup › System): map one to three
 * tabs of a link-shared sheet to customer info, last purchase date and
 * balance, preview the changes, sync now, and pick a schedule.
 */
export function SheetSyncPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [saved, setSaved] = useState<SheetSyncSettings | null>(null)
  const [tabs, setTabs] = useState<TabConfig[]>([])
  const [orders, setOrders] = useState<OrderTab | null>(null)
  const [orderCheck, setOrderCheck] = useState<SheetCheck | undefined>()
  const [checkingOrders, setCheckingOrders] = useState(false)
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy')
  const [schedule, setSchedule] = useState<Schedule>('off')
  const [atTime, setAtTime] = useState('06:00')
  const [weekday, setWeekday] = useState(1)
  const [checks, setChecks] = useState<Record<number, SheetCheck>>({})
  const [checking, setChecking] = useState<number | null>(null)
  const [busy, setBusy] = useState<'save' | 'preview' | 'run' | null>(null)
  const [result, setResult] = useState<{ r: SyncResult; preview: boolean } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [runs, setRuns] = useState<SheetSyncRun[]>([])
  const [openRun, setOpenRun] = useState<string | null>(null)

  const load = (s: SheetSyncSettings) => {
    setSaved(s)
    setTabs(s.tabs.length ? s.tabs : [newTab()])
    setOrders(s.orders ?? null)
    setDateOrder(s.date_order)
    setSchedule(s.schedule)
    setAtTime(s.at_time.slice(0, 5))
    setWeekday(s.weekday)
  }

  useEffect(() => {
    if (!profile?.is_super_admin) return
    sheetSyncService
      .get()
      .then(load)
      .catch((e) => setMsg({ ok: false, text: e.message }))
    sheetSyncService.runs().then(setRuns).catch(() => {})
  }, [profile?.is_super_admin])

  const draft = useMemo(() => ({ tabs, date_order: dateOrder, schedule, at_time: atTime, weekday }), [tabs, dateOrder, schedule, atTime, weekday])
  const ordersDirty = !!saved && JSON.stringify(orders) !== JSON.stringify(saved.orders ?? null)
  const dirty =
    !!saved &&
    (ordersDirty || JSON.stringify(draft) !== JSON.stringify({ tabs: saved.tabs.length ? saved.tabs : [newTab()], date_order: saved.date_order, schedule: saved.schedule, at_time: saved.at_time.slice(0, 5), weekday: saved.weekday }))
  const problem = tabs.map(tabProblem).find(Boolean) ?? orderTabProblem(orders)
  const hasSaved = !!saved && (saved.tabs.length > 0 || !!saved.orders)

  if (!profileLoading && !profile?.is_super_admin) return <Navigate to="/menu" replace />
  if (!saved) return msg ? <p className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-status-danger">{msg.text}</p> : <div className="mx-auto mt-4 h-64 max-w-lg animate-pulse rounded-2xl bg-neutral-100" />

  const check = async (i: number) => {
    setChecking(i)
    try {
      const c = await sheetSyncService.check(tabs[i].url, tabs[i].tab)
      setChecks((prev) => ({ ...prev, [i]: c }))
      // First check of an unmapped tab: take the suggested columns.
      if (c.ok && !tabs[i].key.column && !Object.values(tabs[i].fields).some(Boolean) && !tabs[i].contacts?.length) {
        setTabs((prev) => prev.map((t, j) => (j === i ? { ...newTab(t.url, c.suggested, t.tab), balance_rows: t.balance_rows } : t)))
      }
    } catch (e) {
      setChecks((prev) => ({ ...prev, [i]: { ok: false, error: (e as Error).message } }))
    } finally {
      setChecking(null)
    }
  }

  const checkOrders = async () => {
    if (!orders) return
    setCheckingOrders(true)
    try {
      setOrderCheck(await sheetSyncService.check(orders.url, orders.tab))
    } catch (e) {
      setOrderCheck({ ok: false, error: (e as Error).message })
    } finally {
      setCheckingOrders(false)
    }
  }

  const save = async () => {
    setBusy('save')
    setMsg(null)
    try {
      let s = await sheetSyncService.save(draft)
      if (ordersDirty) s = await sheetSyncService.saveOrders(orders ? { url: orders.url.trim(), tab: orders.tab?.trim() || null } : null)
      load(s)
      setMsg({ ok: true, text: 'Saved.' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const sync = async (preview: boolean) => {
    setBusy(preview ? 'preview' : 'run')
    setMsg(null)
    setResult(null)
    try {
      const r = preview ? await sheetSyncService.preview() : await sheetSyncService.run()
      setResult({ r, preview })
    } catch (e) {
      setResult({ r: { ok: false, error: (e as Error).message }, preview })
    } finally {
      setBusy(null)
      sheetSyncService.runs().then(setRuns).catch(() => {})
      sheetSyncService.get().then(setSaved).catch(() => {})
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-2 md:max-w-2xl md:px-8">
      <p className="px-1 text-[13px] leading-snug text-neutral-500">
        Keep customers, their contacts, last purchase date and balance — and sale orders — in step with a Google Sheet. Rows match customers by the key column; new rows become new customers, and customers missing from the sheet are left alone. Empty cells never erase customer info in the app.
      </p>
      <p className="flex gap-2 rounded-xl bg-status-warn/10 px-3 py-2.5 text-[12.5px] leading-snug text-neutral-800 dark:text-neutral-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warn" aria-hidden />
        <span>
          The sheet must be shared as <b>Anyone with the link can view</b>. Anyone who has the link can see it — including balances — so only share it with people who should.
        </span>
      </p>

      {tabs.map((t, i) => (
        <TabCard
          key={i}
          n={i + 1}
          tab={t}
          check={checks[i]}
          checking={checking === i}
          onChange={(nt) => setTabs((prev) => prev.map((x, j) => (j === i ? nt : x)))}
          onCheck={() => check(i)}
          onRemove={tabs.length > 1 ? () => setTabs((prev) => prev.filter((_, j) => j !== i)) : undefined}
        />
      ))}
      {tabs.length < 3 && (
        <button type="button" onClick={() => setTabs((prev) => [...prev, newTab()])} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-neutral-300 text-sm font-extrabold text-brand-600 dark:border-neutral-600">
          <Plus className="h-4 w-4" /> Add another tab <span className="font-semibold text-neutral-500">· e.g. balances on their own tab</span>
        </button>
      )}

      <OrdersCard
        orders={orders}
        check={orderCheck}
        checking={checkingOrders}
        onChange={(o) => {
          setOrders(o)
          if (!o || o.url !== orders?.url || o.tab !== orders?.tab) setOrderCheck(undefined)
        }}
        onCheck={checkOrders}
      />

      <section className={`${card} space-y-3 p-3.5`}>
        <div className="space-y-1.5">
          <p className={kicker}>Dates in the sheet are written</p>
          <SegmentedControl
            shape="tabs"
            ariaLabel="Date order"
            value={dateOrder}
            onChange={setDateOrder}
            options={[
              { value: 'dmy', label: 'Day/month/year' },
              { value: 'mdy', label: 'Month/day/year' },
            ]}
          />
        </div>
        <div className="space-y-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <p className={kicker}>Sync automatically</p>
          <SegmentedControl shape="tabs" ariaLabel="Schedule" value={schedule} onChange={setSchedule} options={SCHEDULES} />
          {(schedule === 'daily' || schedule === 'weekly') && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {schedule === 'weekly' &&
                WEEKDAYS.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={weekday === i + 1}
                    onClick={() => setWeekday(i + 1)}
                    className={`h-9 rounded-full px-3 text-[13px] font-extrabold ${weekday === i + 1 ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800'}`}
                  >
                    {d}
                  </button>
                ))}
              <label className="flex items-center gap-2 text-[13px] font-semibold text-neutral-700">
                at
                <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value || '06:00')} aria-label="Sync time" className="h-9 rounded-lg border-[1.5px] border-neutral-200 bg-white px-2 text-sm font-bold text-neutral-900 dark:border-neutral-700" />
              </label>
            </div>
          )}
          <p className="text-[12.5px] text-neutral-500">
            {scheduleText({ schedule, at_time: atTime, weekday })} · Phnom Penh time
            {!dirty && saved.next_run_at && schedule !== 'off' ? ` · next ${whenText(saved.next_run_at)}` : ''}
          </p>
        </div>
      </section>

      {msg && <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? 'bg-status-working/10 text-status-working' : 'bg-status-danger/10 text-status-danger'}`}>{msg.text}</p>}
      {problem && dirty && <p className="px-1 text-[13px] font-semibold text-status-danger">{problem}</p>}
      <button type="button" onClick={save} disabled={busy !== null || !dirty || !!problem} className="h-[50px] w-full rounded-2xl bg-brand-500 text-[15px] font-extrabold text-white disabled:opacity-50">
        {busy === 'save' ? 'Saving…' : dirty ? 'Save' : 'Saved'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => sync(true)} disabled={busy !== null || dirty || !hasSaved} className="h-11 rounded-2xl border-[1.5px] border-neutral-200 text-sm font-extrabold text-neutral-800 disabled:opacity-50 dark:border-neutral-700">
          {busy === 'preview' ? 'Reading the sheet…' : 'Preview changes'}
        </button>
        <button type="button" onClick={() => sync(false)} disabled={busy !== null || dirty || !hasSaved} className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-status-working text-sm font-extrabold text-white disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${busy === 'run' ? 'animate-spin' : ''}`} aria-hidden /> {busy === 'run' ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {dirty && hasSaved && <p className="px-1 text-center text-[12.5px] text-neutral-500">Save your changes before previewing or syncing.</p>}
      {result && <ResultCard result={result.r} preview={result.preview} />}

      <section className={`${card} p-3.5`}>
        <div className="flex items-baseline justify-between">
          <p className={kicker}>History</p>
          {saved.last_synced_at && <span className="text-[12px] text-neutral-500">Last synced {whenText(saved.last_synced_at)}</span>}
        </div>
        {runs.length === 0 && <p className="mt-2 text-[13px] text-neutral-500">No syncs yet.</p>}
        {runs.map((r) => {
          const open = openRun === r.id
          const st = RUN_STATUS[r.status]
          return (
            <div key={r.id} className="border-t border-neutral-100 py-2 first-of-type:mt-2 dark:border-neutral-800">
              <button type="button" onClick={() => setOpenRun(open ? null : r.id)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-bold text-neutral-900">{whenText(r.started_at)}</span>
                    <span className="text-[12px] text-neutral-500">{TRIGGER[r.trigger]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${st.tone}`}>{st.label}</span>
                  </span>
                  <span className="block truncate text-[12.5px] text-neutral-500">
                    {r.status === 'failed' ? r.message : `${r.rows_read.toLocaleString('en-US')} rows · ${countsText(r, r.trigger === 'preview')}`}
                  </span>
                  {r.status !== 'failed' && orderCountsText(r.orders, r.trigger === 'preview') && <span className="block truncate text-[12.5px] text-neutral-500">{orderCountsText(r.orders, r.trigger === 'preview')}</span>}
                </span>
                {r.errors.length > 0 || r.message ? open ? <ChevronDown className="h-4 w-4 text-neutral-400" /> : <ChevronRight className="h-4 w-4 text-neutral-400" /> : null}
              </button>
              {open && (
                <ul className="mt-1.5 space-y-0.5 rounded-lg bg-neutral-50 p-2 text-[12px] text-neutral-700 dark:bg-neutral-800">
                  {r.message && <li className="font-semibold">{r.message}</li>}
                  {r.errors.map((e, i) => (
                    <li key={i}>
                      {e.row ? `Tab ${e.tab}, row ${e.row}: ` : ''}
                      {e.reason}
                    </li>
                  ))}
                  {!r.message && r.errors.length === 0 && <li>No problems.</li>}
                </ul>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
