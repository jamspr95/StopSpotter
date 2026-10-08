import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Confetti } from '../components/Confetti'
import { ScreenHeader } from '../components/ScreenHeader'
import { logEvent, withCampaignParam } from '../lib/analytics'

export function DoneShareScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const flowType = (location.state as { flowType?: 'nomination' | 'vote' } | null)?.flowType ?? 'nomination'
  const [copied, setCopied] = useState(false)
  const [showConfetti, setShowConfetti] = useState(true)

  const isNomination = flowType === 'nomination'
  const shareUrl = withCampaignParam(
    `${window.location.origin}${import.meta.env.BASE_URL}`,
    'share',
  )
  const shareText = isNomination
    ? 'I just spotted a potential motorhome aire for AireStop. Have a look on StopSpotter.'
    : 'I just backed a potential motorhome aire on StopSpotter. Go and vote on one near you.'

  // Logged once, on arrival at this screen — this is the funnel's
  // conversion moment (docs/BUILD_PLAN.md "Monitor funnel (click →
  // sign-up → nomination/vote)"), not something to log again on re-render.
  useEffect(() => {
    logEvent(isNomination ? 'nomination_submit' : 'vote_submit', location.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once-on-arrival, not on every isNomination/pathname change
  }, [])

  async function handleShare() {
    logEvent('share_click', location.pathname)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'StopSpotter', text: shareText, url: shareUrl })
        return
      } catch {
        // user cancelled the native share sheet — fall through to copy
      }
    }
    await navigator.clipboard.writeText(`${shareText} ${shareUrl}`)
    setCopied(true)
  }

  return (
    <div className="flex h-dvh flex-col">
      {showConfetti && <Confetti onDone={() => setShowConfetti(false)} />}
      <ScreenHeader
        title={isNomination ? 'Thank you for your stop' : 'Thank you for voting'}
        onBack={false}
      />
      <div className="flex-1 overflow-y-auto p-5">
        <p className="text-base text-slate-700">
          {isNomination
            ? "Thank you for supporting AireStop. We'll let you know what happens to your stop in My Stops."
            : "Thank you for supporting AireStop. Your vote adds to the demand evidence for this stop."}
        </p>

        <button
          type="button"
          onClick={handleShare}
          className="mt-6 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:bg-brand-700"
        >
          {copied ? 'Copied, paste it anywhere' : 'Share'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-4 w-full rounded-xl border border-slate-200 py-3.5 text-base font-semibold text-slate-700"
        >
          Return to map
        </button>

        <button
          type="button"
          onClick={() => navigate('/support')}
          className="mt-4 w-full text-center text-sm font-medium text-brand-700 underline"
        >
          See how else you can support AireStop
        </button>
      </div>
    </div>
  )
}
