import { User } from 'lucide-react'
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
