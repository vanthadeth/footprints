import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { LogoIcon } from '@footprints/shared/components/Logo'
import { useAuth } from '@footprints/shared/features/auth/AuthContext'
import { useProfile } from '@footprints/shared/features/auth/useProfile'
import { SECTIONS } from '@/sections'
import { surveysOnlyAllows } from '@/features/auth/adminAccess'
import { useAdminAccess } from '@/features/auth/useAdminAccess'

export function AdminLayout() {
  const { signOut } = useAuth()
  const { profile } = useProfile()
  const { pathname } = useLocation()
  const { access } = useAdminAccess(!!profile?.is_super_admin)
  // Someone who only sets up surveys sees the Surveys section and nothing else.
  if (access === 'surveysOnly' && !surveysOnlyAllows(pathname)) return <Navigate to="/surveys" replace />
  const sections = access === 'surveysOnly' ? SECTIONS.filter((s) => s.path === '/surveys') : SECTIONS
  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 px-2 pb-4">
          <LogoIcon className="h-8 w-8" />
          <div className="leading-tight">
            <p className="text-sm font-bold text-neutral-900 dark:text-neutral-50">Footprints</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Admin</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {sections.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                  isActive ? 'bg-brand-500 text-white' : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="truncate px-2 text-xs text-neutral-500">{profile?.full_name ?? profile?.email ?? ''}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
