import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { ThanksBanner } from '../components/ThanksBanner'
import { GROWTH_OPTION_CROWDFUND, GROWTH_OPTIONS } from '../data/growthOptions'
import { logEvent } from '../lib/analytics'
import { useAppStore } from '../store/useAppStore'

const FOLLOW_UP_PROMPT: Record<string, { label: string; placeholder: string }> = {
  'I hold a helpful position': {
    label: 'Tell us about your role and how you could help.',
    placeholder: 'For example, a councillor, a planning officer, or someone who knows a landowner.',
  },
  'I have an idea to help growth': {
    label: 'Tell us more about your idea.',
    placeholder: "What's your idea?",
  },
}

export function SupportScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = useAppStore((s) => s.currentUser)
  const beginGrowthFeedback = useAppStore((s) => s.beginGrowthFeedback)
  const completePendingFlowAsCurrentUser = useAppStore((s) => s.completePendingFlowAsCurrentUser)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Captured once at mount, same pattern as SignUpScreen's on-mount flags —
  // SignUpScreen sends a returning (not-previously-signed-in) supporter
  // back here with this flag once their growth feedback is actually saved.
  const [showThanksOnMount] = useState(() =>
    Boolean((location.state as { growthFeedbackThanks?: boolean } | null)?.growthFeedbackThanks),
  )
  const [bannerVisible, setBannerVisible] = useState(showThanksOnMount)

  const alreadySignedIn = currentUser !== null && currentUser.verified

  // A supporter who's already signed in has already given their email —
  // submit straight away and show the banner here, no screen to visit.
  // Someone not yet signed in still needs to give an email first, so that
  // goes through the usual email-capture flow (SignUpScreen); it sends
  // them back here with showThanksOnMount once done.
  async function submitNow(options: string[], note?: string) {
    beginGrowthFeedback(options, note)
    setSubmitting(true)
    setSubmitError(null)
    try {
      await completePendingFlowAsCurrentUser()
      logEvent('growth_feedback_submit', location.pathname)
      setSelectedOption(null)
      setMessage('')
      setBannerVisible(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleOption(option: string) {
    if (option === GROWTH_OPTION_CROWDFUND) {
      if (alreadySignedIn) {
        void submitNow([option])
      } else {
        beginGrowthFeedback([option], undefined)
        navigate('/spot/signup')
      }
      return
    }
    setSelectedOption((current) => (current === option ? null : option))
    setMessage('')
    setSubmitError(null)
  }

  function handleSubmitFollowUp() {
    if (!selectedOption) return
    if (alreadySignedIn) {
      void submitNow([selectedOption], message.trim() || undefined)
    } else {
      beginGrowthFeedback([selectedOption], message.trim() || undefined)
      navigate('/spot/signup')
    }
  }

  const followUp = selectedOption ? FOLLOW_UP_PROMPT[selectedOption] : null

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Support AireStop" logo />
      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-base text-slate-700">
          AireStop is on a mission to build a network of motorhome stopovers across the UK, and
          we need your help.
        </p>
        <ol className="mt-4 flex flex-col gap-3 text-base text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">1. Spot a stop.</span> Know a good
            place you'd like to stay? Tell us about it. If we agree, we'll approach the
            landowner and work to make it happen.
          </li>
          <li>
            <span className="font-semibold text-slate-900">2. Back a stop.</span> Browse the
            map and vote for the stops you'd actually use. Every vote helps show a landowner
            the demand is real.
          </li>
        </ol>
        <p className="mt-4 text-base text-slate-700">
          Right now, the most valuable thing you can do is help us find them. Every nomination
          and vote on StopSpotter becomes evidence we can take to a landowner.
        </p>

        <button
          type="button"
          onClick={() => navigate('/spot')}
          className="mt-6 block w-full rounded-xl bg-brand-600 py-3.5 text-center text-base font-semibold text-white active:bg-brand-700"
        >
          Spot a stop
        </button>

        <div className="mt-8 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-700">Help us grow</p>
          <p className="mt-2 text-sm text-slate-600">
            We're exploring how to grow the UK's network of aires faster. If any of this applies
            to you, tap it below. It'll never change a stop's votes or ranking, it's a separate
            way to help.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {GROWTH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={submitting}
                onClick={() => handleOption(option)}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-medium active:bg-slate-50 disabled:opacity-40 ${
                  selectedOption === option
                    ? 'border-brand-600 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {followUp && (
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700">{followUp.label}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={followUp.placeholder}
                rows={3}
                className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm"
              />
              <button
                type="button"
                disabled={message.trim() === '' || submitting}
                onClick={handleSubmitFollowUp}
                className="mt-2 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          )}

          {submitError && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</p>
          )}

          {!alreadySignedIn && (
            <p className="mt-3 text-xs text-slate-500">
              We'll ask for your email so we can get back to you.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-8 block w-full rounded-xl border border-slate-200 py-3.5 text-center text-base font-semibold text-slate-700 active:bg-slate-50"
        >
          Back to map
        </button>
      </div>

      {bannerVisible && (
        <ThanksBanner message="Thanks for letting us know." onDone={() => setBannerVisible(false)} />
      )}
    </div>
  )
}
