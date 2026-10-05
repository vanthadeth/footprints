import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ShieldAlert } from 'lucide-react'
import { useProfile } from '@/features/auth/useProfile'
import { AppearanceControl } from '@/components/AppearanceControl'

/**
 * Global settings a super admin (`users.is_super_admin`) sets for everyone
 * -- this is what useAppSettings() reads everywhere else in the app
 * (location ping frequency, geofence radius, auto check-out, working
 * hours). RLS (`app_settings_update`, gated on the `settings:edit`
 * permission, which a super admin always has via app.can()'s blanket
 * 'any' scope) is the real enforcement; the check below just keeps the
 * form from showing to people who couldn't save it anyway.
 */
export function SettingsPage() {
  const { profile, loading: profileLoading } = useProfile()

  return (
    <div className="mx-auto max-w-lg space-y-3 p-4 pb-28 md:max-w-2xl">
      {/* Appearance is everyone's, not just a super admin's -- the rest of
          this screen (below) is the global config only a super admin can
          see or edit. */}
      <Section title="Appearance">
        <AppearanceControl />
      </Section>

      {profileLoading ? (
        <div className="h-48 animate-pulse rounded-xl2 bg-neutral-100" />
      ) : !profile?.is_super_admin ? (
        <div className="flex flex-col items-center px-6 pt-10 text-center">
          <ShieldAlert className="h-10 w-10 text-neutral-300" />
          <p className="mt-4 text-sm text-neutral-500">Only a super admin can view global settings.</p>
        </div>
      ) : (
        <SettingsForm />
      )}
    </div>
  )
}

/** Company-wide settings now live on their own Admin screens; this lists them. */
function SettingsForm() {
  return (
    <Section title="Company settings">
      <div className="space-y-2">
        {[
          ['/settings/working-hours', 'Working hours', 'Hours & days · clock-in and clock-out rules'],
          ['/admin/attendance', 'Attendance', 'Cycle · leave allowances · flexible days · holidays'],
          ['/admin/geofence', 'Geofence & rules', 'Work locations, check-in distance, GPS and alert thresholds'],
          ['/admin/sync', 'Data & sync', 'Google Sheet sync and recent runs'],
        ].map(([to, label, sub]) => (
          <Link key={to} to={to} className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 tap-target">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-neutral-900">{label}</span>
              <span className="block truncate text-xs text-neutral-500">{sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          </Link>
        ))}
      </div>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl2 bg-white shadow-card">
      <p className="px-4 pt-3.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="space-y-4 p-4">{children}</div>
    </div>
  )
}
