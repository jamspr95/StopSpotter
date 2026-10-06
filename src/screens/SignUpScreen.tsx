import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAppStore } from '../store/useAppStore'

export function SignUpScreen() {
  const navigate = useNavigate()
  const pendingFlow = useAppStore((s) => s.pendingFlow)
  const awaitingVerificationId = useAppStore((s) => s.awaitingVerificationId)
  const finalizePendingFlow = useAppStore((s) => s.finalizePendingFlow)
  const confirmMagicLink = useAppStore((s) => s.confirmMagicLink)
  const cancelPendingFlow = useAppStore((s) => s.cancelPendingFlow)

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [news, setNews] = useState(false)
  const [support, setSupport] = useState(false)

  // Captured once at mount, not re-read on every pendingFlow change: completing the
  // flow (finalizePendingFlow / confirmMagicLink) clears pendingFlow and navigates
  // away in the same handler, and a reactive guard here would race that navigation
  // and bounce the user back to "/" instead.
  const [hadPendingFlowOnMount] = useState(() => pendingFlow !== null)

  useEffect(() => {
    if (!hadPendingFlowOnMount) navigate('/')
  }, [hadPendingFlowOnMount, navigate])

  if (!pendingFlow) return null

  const isNomination = pendingFlow.type === 'nomination'
  const emailValid = /\S+@\S+\.\S+/.test(email)

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
            Prototype note: no email is actually sent yet (that's Milestone 2's magic-link
            auth). Use the button below to simulate clicking the link.
          </div>
          <button
            type="button"
            onClick={() => {
              confirmMagicLink()
              navigate('/done', { state: { flowType: isNomination ? 'nomination' : 'vote' } })
            }}
            className="mt-4 w-full rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white active:bg-teal-700"
          >
            Simulate magic-link click
          </button>
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
          We'll use your email to sign you in and tell you what happens to sites you spot.
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

        <button
          type="button"
          disabled={!emailValid}
          onClick={() => finalizePendingFlow({ email, firstName: firstName || undefined, news, support })}
          className="mt-6 w-full rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          Send my link
        </button>

        {isNomination && (
          <button
            type="button"
            onClick={() => {
              finalizePendingFlow({ email: null, news: false, support: false })
              navigate('/done', { state: { flowType: 'nomination' } })
            }}
            className="mt-3 w-full text-center text-sm font-medium text-slate-500 underline"
          >
            Submit without email
          </button>
        )}
      </div>
    </div>
  )
}
