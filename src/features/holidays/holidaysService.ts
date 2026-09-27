import { supabase } from '@/lib/supabase'
import type { Holiday } from './holidays'

type Row = {
  id: string
  name: string
  start_date: string
  end_date: string
  kind: string
  half_day: boolean
  department_ids: string[] | null
}

const fromRow = (r: Row): Holiday => ({
  id: r.id,
  name: r.name,
  startDate: r.start_date,
  endDate: r.end_date,
  kind: r.kind === 'company' ? 'company' : 'public',
  halfDay: r.half_day,
  departmentIds: r.department_ids,
})

const toRow = (h: Omit<Holiday, 'id'>) => ({
  name: h.name.trim(),
  start_date: h.startDate,
  end_date: h.endDate,
  kind: h.kind,
  half_day: h.halfDay,
  department_ids: h.departmentIds && h.departmentIds.length ? h.departmentIds : null,
})

/** Public holidays (0089). Everyone can read; HR/admins write (RLS: settings:edit or leave_balance:edit). */
export const holidaysService = {
  async listYear(year: number): Promise<Holiday[]> {
    const { data, error } = await supabase
      .from('public_holidays')
      .select('id, name, start_date, end_date, kind, half_day, department_ids')
      .lte('start_date', `${year}-12-31`)
      .gte('end_date', `${year}-01-01`)
      .order('start_date')
    if (error) throw error
    return (data ?? []).map(fromRow)
  },

  async create(h: Omit<Holiday, 'id'>): Promise<void> {
    const { error } = await supabase.from('public_holidays').insert(toRow(h))
    if (error) throw error
  },

  async createMany(list: Omit<Holiday, 'id'>[]): Promise<void> {
    if (!list.length) return
    const { error } = await supabase.from('public_holidays').insert(list.map(toRow))
    if (error) throw error
  },

  async update(id: string, h: Omit<Holiday, 'id'>): Promise<void> {
    const { error } = await supabase.from('public_holidays').update({ ...toRow(h), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('public_holidays').delete().eq('id', id)
    if (error) throw error
  },
}
