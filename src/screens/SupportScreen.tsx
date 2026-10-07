import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAppStore } from '../store/useAppStore'

const GROWTH_OPTIONS = [
  "I'd support a crowdfund",
  'I hold a helpful position',
  "I've got an idea to grow the network",
]

export function SupportScreen() {
  const navigate = useNavigate()
  const beginGrowthFeedback = useAppStore((s) => s.beginGrowthFeedback)
  const [message, setMessage] = useState('')

  // Tapping an option is itself the submit action — it carries straight into
  // the same email-capture flow nomination/vote use (SignUpScreen), so
  // there's someone real to follow up with rather than an anonymous row.
  function handleOption(option: string) {
    beginGrowthFeedback([option], message.trim() || undefined)
    navigate('/spot/signup')
  }

  function handleSendMessage() {
    beginGrowthFeedback([], message.trim() || undefined)
    navigate('/spot/signup')
  }

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Support AireStop" logo />
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-base text-slate-700">
          AireStop is on a mission to build a network of motorhome stopovers across the UK —
          and we need your help.
        </p>
        <ol className="mt-3 flex flex-col gap-2 text-base text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">1. Spot a stop.</span> Know a good
            place you'd like to stay? Tell us about it — if we agree, we'll approach the
            landowner and work to make it happen.
          </li>
          <li>
            <span className="font-semibold text-slate-900">2. Back a stop.</span> Browse the
            map and vote for the stops you'd actually use. Every vote helps show a landowner
            the demand is real.
          </li>
        </ol>
        <p className="mt-3 text-base text-slate-700">
          Right now, the most valuable thing you can do is help us find them: every nomination
          and vote on StopSpotter becomes evidence we can take to a landowner.
        </p>

        <button
          type="button"
          onClick={() => navigate('/spot')}
          className="mt-5 block w-full rounded-xl bg-brand-600 py-3.5 text-center text-base font-semibold text-white active:bg-brand-700"
        >
          Spot a stop
        </button>

        <div className="mt-6 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Help us grow</p>
          <p className="mt-1 text-sm text-slate-600">
            We're exploring how to grow and develop StopSpotter faster. If any of this applies
            to you, tap it below — it'll never change a stop's votes or ranking, it's a separate
            way to help. We'll ask for your email so we can get back to you.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {GROWTH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleOption(option)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 active:bg-slate-50"
              >
                {option}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything else you'd like to tell us?"
            rows={3}
            className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"
          />

          <button
            type="button"
            disabled={message.trim() === ''}
            onClick={handleSendMessage}
            className="mt-2 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 block w-full rounded-xl border border-slate-200 py-3.5 text-center text-base font-semibold text-slate-700 active:bg-slate-50"
        >
          Back to map
        </button>
      </div>
    </div>
  )
}
