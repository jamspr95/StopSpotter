import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { useAdminStore } from '../../store/useAdminStore'

const NAV_ITEMS = [
  { to: '/admin', label: 'Stops', end: true },
  { to: '/admin/moderation', label: 'Moderation' },
  { to: '/admin/reports', label: 'Reports' },
]

/**
 * Gates every /admin/* route except /admin/login. Re-checks the session on
 * mount rather than trusting cached state — this is the one place in the
 * app that must not render anything for a signed-out or non-admin visitor,
 * even for a flash of a frame.
 */
export function AdminLayout() {
  const navigate = useNavigate()
  const sessionStatus = useAdminStore((s) => s.sessionStatus)
  const adminEmail = useAdminStore((s) => s.adminEmail)
  const checkSession = useAdminStore((s) => s.checkSession)
  const signOut = useAdminStore((s) => s.signOut)

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  useEffect(() => {
    if (sessionStatus === 'signed_out' || sessionStatus === 'not_admin') {
      navigate('/admin/login', { replace: true })
    }
  }, [sessionStatus, navigate])

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
        <p className="max-w-sm text-center text-sm text-slate-600">
          No backend is configured yet — the admin dashboard needs a real Supabase project. See
          docs/SETUP.md.
        </p>
      </div>
    )
  }

  if (sessionStatus !== 'admin') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Checking admin session…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh bg-slate-100">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white p-4">
        <h1 className="font-display text-base font-semibold text-slate-900">StopSpotter admin</h1>
        <nav className="mt-6 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-xs text-slate-400">
          <p className="truncate">{adminEmail}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 font-medium text-brand-700 underline"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
