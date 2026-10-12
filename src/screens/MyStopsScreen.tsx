import { useNavigate } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { formatEnumLabel, STATUS_LABEL } from '../lib/labels'
import { useAppStore } from '../store/useAppStore'

export function MyStopsScreen() {
  const navigate = useNavigate()
  const currentUser = useAppStore((s) => s.currentUser)
  const allNominations = useAppStore((s) => s.nominations)
  const allVotes = useAppStore((s) => s.votes)
  const beginSignIn = useAppStore((s) => s.beginSignIn)
  const nominations = currentUser
    ? allNominations.filter((n) => n.userId === currentUser.id)
    : []
  const votes = currentUser ? allVotes.filter((v) => v.userId === currentUser.id) : []

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="My Stops" />
      <div className="flex-1 overflow-y-auto p-5">
        {!currentUser && (
          <div>
            <p className="text-sm text-slate-500">
              Nominated or voted on a different browser or device? Sign in with the same email to
              see it here. Haven't done either yet? Sign in anyway to get on our list.
            </p>
            <button
              type="button"
              onClick={() => {
                beginSignIn()
                navigate('/spot/signup')
              }}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-base font-semibold text-white active:bg-brand-700"
            >
              Sign in
            </button>
          </div>
        )}

        {currentUser && nominations.length === 0 && votes.length === 0 && (
          <p className="text-sm text-slate-500">
            Nothing here yet. Nominate a stop or vote on one from the map.
          </p>
        )}

        {nominations.length > 0 && (
          <div className="mb-7">
            <h2 className="mb-3 text-sm font-semibold text-slate-500">Nominations</h2>
            <ul className="flex flex-col gap-3">
              {nominations.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => navigate(`/stop/${n.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left"
                  >
                    <span className="text-sm text-slate-800">
                      {formatEnumLabel(n.answers.placeType, 'Potential stop')}
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
            <h2 className="mb-3 text-sm font-semibold text-slate-500">Votes</h2>
            <ul className="flex flex-col gap-3">
              {votes.map((v) => {
                const stop = allNominations.find((n) => n.id === v.nominationId)
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => navigate(`/stop/${v.nominationId}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left"
                    >
                      <span className="text-sm text-slate-800">
                        {stop ? formatEnumLabel(stop.answers.placeType, 'Potential stop') : 'Stop'}
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
