import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAppStore } from '../store/useAppStore'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  live: 'Live',
  not_suitable: 'Not suitable',
}

const PLACE_LABEL: Record<string, string> = {
  unused_land: 'Unused land',
  grass_field: 'Grass area or field',
  lay_by: 'Lay-by',
  car_park: 'Car park',
  other: 'Other',
}

export function StopCardScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const nomination = useAppStore((s) => s.nominations.find((n) => n.id === id))
  const allVotes = useAppStore((s) => s.votes)
  const beginVote = useAppStore((s) => s.beginVote)
  const votes = useMemo(() => allVotes.filter((v) => v.nominationId === id), [allVotes, id])

  const payShare = useMemo(() => {
    if (votes.length === 0) return null
    const willingToPay = votes.filter((v) => v.payBand !== 'free_only').length
    return Math.round((willingToPay / votes.length) * 100)
  }, [votes])

  if (!nomination) {
    return (
      <div className="flex h-dvh flex-col">
        <ScreenHeader title="Stop not found" />
        <p className="p-4 text-sm text-slate-600">
          This stop isn't in the prototype's demo data.{' '}
          <button className="text-brand-700 underline" onClick={() => navigate('/')}>
            Back to the map
          </button>
        </p>
      </div>
    )
  }

  const nearby = nomination.answers.nearby.filter((item) => item !== 'none')

  return (
    <div className="flex h-dvh flex-col bg-white">
      <ScreenHeader title="Stop" />
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          {STATUS_LABEL[nomination.status]}
        </p>
        <h2 className="font-display mt-1 text-xl font-bold text-slate-900">
          {PLACE_LABEL[nomination.answers.placeType]}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{nomination.councilArea}</p>

        {nomination.whyHere && (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm italic text-slate-700">
            "{nomination.whyHere}"
          </p>
        )}

        {nearby.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">Nearby</p>
            <p className="text-sm text-slate-600">{nearby.join(', ').replace(/_/g, ' ')}</p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 rounded-xl bg-brand-50 p-3">
          <div>
            <p className="text-2xl font-bold text-brand-800">{votes.length}</p>
            <p className="text-xs text-brand-700">
              {votes.length === 1 ? 'vote' : 'votes'}
            </p>
          </div>
          {payShare !== null && (
            <div>
              <p className="text-2xl font-bold text-brand-800">{payShare}%</p>
              <p className="text-xs text-brand-700">would pay to stay</p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={() => {
            beginVote(nomination.id)
            navigate('/vote')
          }}
          className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:bg-brand-700"
        >
          I'd stay here
        </button>
      </div>
    </div>
  )
}
