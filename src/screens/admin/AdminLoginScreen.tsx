import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { useAdminStore } from '../../store/useAdminStore'

export function AdminLoginScreen() {
  const navigate = useNavigate()
  const signIn = useAdminStore((s) => s.signIn)
  const storeError = useAdminStore((s) => s.error)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
        <div className="max-w-sm rounded-xl bg-white p-6 text-center shadow-sm">
          <h1 className="font-display text-lg font-semibold text-slate-900">Admin</h1>
          <p className="mt-2 text-sm text-slate-600">
            No backend is configured yet — the admin dashboard needs a real Supabase project.
            See docs/SETUP.md.
          </p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email, password)
      if (useAdminStore.getState().sessionStatus === 'admin') {
        navigate('/admin')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed — check your details.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm"
      >
        <h1 className="font-display text-lg font-semibold text-slate-900">StopSpotter admin</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with an admin account.</p>

        <label className="mt-4 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm"
        />

        <label className="mt-3 block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm"
        />

        {(error || storeError) && (
          <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">
            {error ?? storeError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
