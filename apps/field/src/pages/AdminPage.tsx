import { AdminGroup, AdminRow } from '@footprints/shared/components/AdminKit'
import { useRoleGroup } from '@/features/nav/useRoleGroup'
import { adminRows, partTitle, rowLabel, rowSub } from '@/features/nav/navConfig'
import { useLanguage } from '@footprints/shared/i18n/LanguageContext'

/** Admin (tab for System Admin / Super Admin): every administration screen the person can use, in one list. */
export function AdminPage() {
  const { t } = useLanguage()
  const { ctx } = useRoleGroup()
  const rows = adminRows(ctx)
  // Sections as on the design canvas (Polish › Admin); anything new lands in System.
  const SECTIONS: [string, string[]][] = [
    [partTitle('people', t), ['users', 'permissions']],
    [t('menu.adminTime'), ['hours', 'adminatt', 'locations']],
    [t('menu.adminData'), ['sheetsync']],
  ]
  const placed = new Set(SECTIONS.flatMap(([, keys]) => keys))
  const groups = [...SECTIONS.map(([title, keys]) => [title, rows.filter((r) => keys.includes(r.key))] as const), [partTitle('system', t), rows.filter((r) => !placed.has(r.key))] as const].filter(([, list]) => list.length > 0)
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-[18px] px-4 pb-8 pt-1 md:max-w-2xl md:px-8 lg:max-w-6xl lg:pt-6">
      <p className="-mb-2 text-[14px] text-neutral-500">{t('menu.adminSub')}</p>
      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-6">
      {groups.map(([title, list]) => (
        <AdminGroup key={title} title={title}>
          {list.map((r) => (
            <AdminRow key={r.key} icon={r.icon} label={rowLabel(r, t)} sub={rowSub(r, t)} to={r.to} />
          ))}
        </AdminGroup>
      ))}
      </div>
    </div>
  )
}
