import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useAppStore } from '../store/useAppStore'

export function SignUpScreen() {
  const navigate = useNavigate()
  const pendingFlow = useAppStore((s) => s.pendingFlow)
  const awaitingVerificationId = useAppStore((s) => s.awaitingVerificationId)
  const awaitingMagicLink = useAppStore((s) => s.awaitingMagicLink)
  const finalizePendingFlow = useAppStore((s) => s.finalizePendingFlow)
  const confirmMagicLink = useAppStore((s) => s.confirmMagicLink)
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
  // Real-backend mode: a page reload (the magic-link email redirect lands back
  // on this exact route) remounts this component with awaitingMagicLink still
  // true from before the redirect. completePendingSignIn (in the store's auth
  // listener) clears pendingFlow once it finishes writing — this effect is
  // what notices that and moves on to /done, since nothing else does.
  const [wasAwaitingMagicLinkOnMount] = useState(() => awaitingMagicLink)

  useEffect(() => {
    if (!hadPendingFlowOnMount) navigate('/')
  }, [hadPendingFlowOnMount, navigate])

  useEffect(() => {
    if (wasAwaitingMagicLinkOnMount && !pendingFlow) {
      navigate('/done', { state: { flowType: flowTypeOnMount ?? 'nomination' } })
    }
  }, [wasAwaitingMagicLinkOnMount, pendingFlow, flowTypeOnMount, navigate])

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

  if (awaitingMagicLink) {
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
