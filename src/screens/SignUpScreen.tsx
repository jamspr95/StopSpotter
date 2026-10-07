import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import type { SSOProvider } from '../lib/db'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useAppStore } from '../store/useAppStore'

const SSO_PROVIDERS: Array<{ id: SSOProvider; label: string }> = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'facebook', label: 'Continue with Facebook' },
]

export function SignUpScreen() {
  const navigate = useNavigate()
  const pendingFlow = useAppStore((s) => s.pendingFlow)
  const awaitingVerificationId = useAppStore((s) => s.awaitingVerificationId)
  const authMethod = useAppStore((s) => s.authMethod)
  const finalizePendingFlow = useAppStore((s) => s.finalizePendingFlow)
  const confirmMagicLink = useAppStore((s) => s.confirmMagicLink)
  const signInWithSSO = useAppStore((s) => s.signInWithSSO)
  const cancelPendingFlow = useAppStore((s) => s.cancelPendingFlow)

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [news, setNews] = useState(false)
  const [support, setSupport] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Captured once at mount, not re-read on every pendingFlow change: completing the
  // flow (finalizePendingFlow / confirmMagicLink) clears pendingFlow and navigates
  // away in the same handler, and a reactive guard here would race that navigation
  // and bounce the user back to "/" instead.
  const [hadPendingFlowOnMount] = useState(() => pendingFlow !== null)
  const [flowTypeOnMount] = useState(() => pendingFlow?.type ?? null)
  // Real-backend mode: a page reload (the magic-link email click, or the
  // OAuth provider's redirect back) lands back on this exact route and
  // remounts this component with authMethod still set from before the
  // redirect. completePendingSignIn (in the store's auth listener) clears
  // pendingFlow once it finishes writing — this effect is what notices
  // that and moves on to /done, since nothing else does.
  const [wasAwaitingAuthOnMount] = useState(() => authMethod !== null)

  useEffect(() => {
    if (!hadPendingFlowOnMount) navigate('/')
  }, [hadPendingFlowOnMount, navigate])

  useEffect(() => {
    if (wasAwaitingAuthOnMount && !pendingFlow) {
      navigate('/done', { state: { flowType: flowTypeOnMount ?? 'nomination' } })
    }
  }, [wasAwaitingAuthOnMount, pendingFlow, flowTypeOnMount, navigate])

  if (!pendingFlow) return null

  const isNomination = pendingFlow.type === 'nomination'
  const emailValid = /\S+@\S+\.\S+/.test(email)

  async function handleSendLink() {
    setSubmitting(true)
    setError(null)
    try {
      await finalizePendingFlow({ email, firstName: firstName || undefined, news, support })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setSubmitting(false)
    }
  }

  async function handleSubmitWithoutEmail() {
    setSubmitting(true)
    setError(null)
    try {
      await finalizePendingFlow({ email: null, news: false, support: false })
      navigate('/done', { state: { flowType: 'nomination' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setSubmitting(false)
    }
  }

  async function handleSSO(provider: SSOProvider) {
    setSubmitting(true)
    setError(null)
    try {
      await signInWithSSO(provider, { firstName: firstName || undefined, news, support })
      // No navigation here — signInWithOAuth takes the browser to the
      // provider's consent screen itself; this line may never run.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      setSubmitting(false)
    }
  }

  if (awaitingVerificationId) {
    return (
      <div className="flex h-dvh flex-col">
        <ScreenHeader title="Check your email" onBack={false} />
        <div className="flex-1 p-4">
          <p className="text-base text-slate-700">
            We've sent a link to <span className="font-medium">{email}</span>. Click it to
            confirm{isNomination ? ' your nomination' : ' your vote'}.
          </p>
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
            Prototype note: no email is actually sent yet — that needs a live Supabase project
            (see docs/SETUP.md). Use the button below to simulate clicking the link.
          </div>
          <button
            type="button"
            onClick={() => {
              confirmMagicLink()
              navigate('/done', { state: { flowType: isNomination ? 'nomination' : 'vote' } })
            }}
            className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:bg-brand-700"
          >
            Simulate magic-link click
          </button>
        </div>
      </div>
    )
  }

  // Real-backend mode, magic link sent — waits for the redirect, same as
  // above but for real (no simulate button). OAuth has no equivalent
  // screen: the browser already left for the provider's consent page.
  if (authMethod === 'magic_link') {
    return (
      <div className="flex h-dvh flex-col">
        <ScreenHeader title="Check your email" onBack={false} />
        <div className="flex-1 p-4">
          <p className="text-base text-slate-700">
            We've sent a link to <span className="font-medium">{email}</span>. Open it on this
            device to confirm{isNomination ? ' your nomination' : ' your vote'} — this page will
            carry on automatically once you do.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader
        title="Almost done"
        onBack={() => {
          cancelPendingFlow()
          navigate(-1)
        }}
      />
      <div className="flex-1 overflow-y-auto p-4">
        {isSupabaseConfigured && (
          <>
            <div className="flex flex-col gap-2">
              {SSO_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSSO(p.id)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-800 disabled:opacity-40 active:bg-slate-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        <label className="block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-base"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700">
          First name (optional)
        </label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-base"
        />

        <p className="mt-5 text-sm text-slate-600">
          We'll use your email to sign you in and tell you what happens to stops you spot.
        </p>

        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={news}
            onChange={(e) => setNews(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-slate-300"
          />
          Send me news about StopSpotter and AireStop.
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={support}
            onChange={(e) => setSupport(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-slate-300"
          />
          Tell me about ways to support AireStop, like memberships and crowdfunding.
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <button
          type="button"
          disabled={!emailValid || submitting}
          onClick={handleSendLink}
          className="mt-6 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Send my link'}
        </button>

        {isNomination && (
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmitWithoutEmail}
            className="mt-3 w-full text-center text-sm font-medium text-slate-500 underline disabled:opacity-40"
          >
            Submit without email
          </button>
        )}

        {isSupabaseConfigured && (
          <p className="mt-6 text-center text-xs text-slate-400">Connected to the live backend.</p>
        )}
      </div>
    </div>
  )
}
