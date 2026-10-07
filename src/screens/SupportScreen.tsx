import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'

export function SupportScreen() {
  const navigate = useNavigate()

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Support AireStop" />
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-base text-slate-700">
          AireStop is working to get more motorhome aires on the ground across England, Wales
          and Scotland. Right now, the most valuable thing you can do is help us find them:
          every nomination and vote on StopSpotter becomes evidence we can take to a landowner.
        </p>

        <button
          type="button"
          onClick={() => navigate('/spot')}
          className="mt-5 block w-full rounded-xl bg-brand-600 py-3.5 text-center text-base font-semibold text-white active:bg-brand-700"
        >
          Spot a stop
        </button>

        <div className="mt-6 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">Coming soon</p>
          <p className="mt-1 text-sm text-slate-600">
            Once we've got enough stops and demand evidence, we'll open a crowdfunder and
            supporter memberships to help get them certified. Backing AireStop will never
            change a stop's votes or ranking — it'll be a separate way to help.
          </p>
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
