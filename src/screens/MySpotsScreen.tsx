import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAppStore } from '../store/useAppStore'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  live: 'Live',
  not_suitable: 'Not suitable',
}

export function MySpotsScreen() {
  const navigate = useNavigate()
  const currentUser = useAppStore((s) => s.currentUser)
  const allNominations = useAppStore((s) => s.nominations)
  const allVotes = useAppStore((s) => s.votes)
  const nominations = currentUser
    ? allNominations.filter((n) => n.userId === currentUser.id)
    : []
  const votes = currentUser ? allVotes.filter((v) => v.userId === currentUser.id) : []

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="My spots" />
      <div className="flex-1 overflow-y-auto p-4">
        {!currentUser && (
          <p className="text-sm text-slate-500">
            Nominate or vote on a site and sign up to see it here.
          </p>
        )}

        {currentUser && nominations.length === 0 && votes.length === 0 && (
          <p className="text-sm text-slate-500">
            Nothing yet — nominate a site or vote on one from the map.
          </p>
        )}

        {nominations.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Nominations</h2>
            <ul className="flex flex-col gap-2">
              {nominations.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => navigate(`/site/${n.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left"
                  >
                    <span className="text-sm text-slate-800">
                      {n.answers.placeType.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-medium text-brand-700">
                      {STATUS_LABEL[n.status]}
                      {!n.verified && ' · unverified'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {votes.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-500">Votes</h2>
            <ul className="flex flex-col gap-2">
              {votes.map((v) => {
                const site = allNominations.find((n) => n.id === v.nominationId)
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => navigate(`/site/${v.nominationId}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left"
                    >
                      <span className="text-sm text-slate-800">
                        {site ? site.answers.placeType.replace('_', ' ') : 'Site'}
                      </span>
                      <span className="text-xs font-medium text-brand-700">
                        {v.verified ? 'Counted' : 'Pending verification'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
