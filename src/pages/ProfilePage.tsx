import { ChevronRight, Menu as MenuIcon, Truck, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useProfile } from '@/features/auth/useProfile'

export function ProfilePage() {
  const { profile, loading } = useProfile()

  return (
    <div className="mx-auto max-w-lg md:max-w-2xl">
      <PageHeader title="Profile" />

      <div className="px-4 md:px-8">
        {loading ? (
          <div className="animate-pulse rounded-xl2 bg-neutral-100 p-6" />
        ) : profile ? (
          <div className="rounded-xl2 bg-white p-5 shadow-card">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <User className="h-8 w-8" aria-hidden />
              </div>
              <div>
                <p className="text-lg font-semibold text-neutral-900">{profile.full_name}</p>
                <p className="text-sm text-neutral-500">{profile.role_name ?? '—'}</p>
              </div>
            </div>

            <dl className="mt-6 divide-y divide-neutral-100 text-sm">
              <Row label="Position" value={profile.position || '—'} />
              <Row label="Phone" value={profile.phone_primary || '—'} />
              <Row label="Email" value={profile.email || '—'} />
              <Row label="Employed since" value={profile.employment_date || '—'} />
            </dl>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">We couldn't load your profile.</p>
        )}

        {/* Fleet/Menu moved off the (now 3-item) bottom bar -- Profile is
            where they live now. Fleet is shown to everyone; the my_team
            RPC it reads from is RBAC-scoped server-side and simply comes
            back empty for anyone with no reports, same as before. */}
        <div className="mt-4 overflow-hidden rounded-xl2 bg-white shadow-card">
          <Link to="/fleet" className="flex items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target">
            <Truck className="h-5 w-5 text-neutral-400" aria-hidden />
            <span className="flex-1">Fleet</span>
            <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
          </Link>
          <Link
            to="/menu"
            className="flex items-center gap-3 border-t border-neutral-100 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 tap-target"
          >
            <MenuIcon className="h-5 w-5 text-neutral-400" aria-hidden />
            <span className="flex-1">Menu</span>
            <ChevronRight className="h-4 w-4 text-neutral-300" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  )
}
