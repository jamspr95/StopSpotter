import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { useAdminStore } from '../../store/useAdminStore'

const NAV_ITEMS = [
  { to: '/admin', label: 'Stops', end: true },
  { to: '/admin/review', label: 'Review' },
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
  const [menuOpen, setMenuOpen] = useState(false)

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
    <div className="flex min-h-dvh flex-col bg-slate-100 md:flex-row">
      {/* Desktop: a fixed sidebar, same as before. Mobile (<md): a top bar
          with a hamburger instead — there's no room for a 224px rail next
          to admin tables/cards on a phone. */}
      <aside className="hidden w-56 flex-col border-r border-slate-200 bg-white p-4 md:flex">
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

      <header className="relative flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <h1 className="font-display text-base font-semibold text-slate-900">StopSpotter admin</h1>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-700 active:bg-slate-100"
        >
          ☰
        </button>
        {menuOpen && (
          <div className="absolute right-3 top-14 z-20 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-brand-600 text-white' : 'text-slate-700 active:bg-slate-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
              <p className="truncate px-3">{adminEmail}</p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left font-medium text-brand-700 active:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>
      {menuOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-10 cursor-default md:hidden"
        />
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
