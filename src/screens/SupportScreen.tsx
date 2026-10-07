import { ScreenHeader } from '../components/ScreenHeader'

export function SupportScreen() {
  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Support AireStop" />
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-base text-slate-700">
          AireStop is working to get more motorhome aires on the ground across England, Wales
          and Scotland. Every nomination and vote on StopSpotter becomes evidence we can take
          to a landowner — but getting a site certified also takes funding.
        </p>
        <p className="mt-3 text-base text-slate-700">
          Backing AireStop never changes a site's votes or ranking — it's a separate way to
          help.
        </p>

        <a
          href="#"
          className="mt-5 block w-full rounded-xl bg-brand-600 py-3.5 text-center text-base font-semibold text-white"
        >
          Become a supporter
        </a>
        <a
          href="#"
          className="mt-3 block w-full rounded-xl border border-slate-200 py-3.5 text-center text-base font-semibold text-slate-700"
        >
          See the crowdfunder
        </a>

        <p className="mt-6 text-xs text-slate-400">
          Prototype note: these link out to AireStop's supporter tier and crowdfunder pages —
          not wired up yet in this milestone.
        </p>
      </div>
    </div>
  )
}
