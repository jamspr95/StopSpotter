import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChoiceButtons } from '../components/ChoiceButtons'
import { ProgressBar } from '../components/ProgressBar'
import { ScreenHeader } from '../components/ScreenHeader'
import { howKnownOptions, nominationQuestions, payBandOptions } from '../data/questions'
import { useAppStore } from '../store/useAppStore'
import type { HowKnown, OwnerType, PayBand } from '../types'

type Step = 'owner' | 'landowner' | 'pay_band'

export function VoteScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const duplicateNotice = Boolean((location.state as { duplicateNotice?: boolean } | null)?.duplicateNotice)

  const pendingFlow = useAppStore((s) => s.pendingFlow)
  const nominations = useAppStore((s) => s.nominations)
  const updateVoteDraft = useAppStore((s) => s.updateVoteDraft)
  const [stepIndex, setStepIndex] = useState(0)

  const draft = pendingFlow?.type === 'vote' ? pendingFlow.draft : null
  const nomination = nominations.find((n) => n.id === draft?.nominationId)
  const ownerQuestion = nominationQuestions.find((q) => q.id === 'ownerType')!

  const ownerUnknown = nomination?.answers.ownerType === 'dont_know'

  const steps = useMemo<Step[]>(() => {
    if (!ownerUnknown) return ['pay_band']
    const includeLandowner = draft?.ownerType && draft.ownerType !== 'dont_know'
    return ['owner', ...(includeLandowner ? (['landowner'] as Step[]) : []), 'pay_band']
  }, [ownerUnknown, draft?.ownerType])

  useEffect(() => {
    if (!draft || !nomination) navigate('/')
  }, [draft, nomination, navigate])

  if (!draft || !nomination) return null

  const step = steps[stepIndex]

  function goNext() {
    if (stepIndex + 1 >= steps.length) {
      navigate('/spot/signup')
    } else {
      setStepIndex((i) => i + 1)
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Vote" onBack={() => (stepIndex === 0 ? navigate(-1) : setStepIndex((i) => i - 1))} />
      <ProgressBar step={stepIndex} total={steps.length} />

      <div className="flex-1 overflow-y-auto p-4">
        {duplicateNotice && stepIndex === 0 && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Someone's already spotted this — add your vote?
          </div>
        )}

        {step === 'owner' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{ownerQuestion.prompt}</h2>
            <p className="mt-1 text-sm text-slate-500">
              The owner isn't known yet — your answer helps establish it.
            </p>
            <div className="mt-3">
              <ChoiceButtons
                options={ownerQuestion.options}
                selected={draft.ownerType ? [draft.ownerType] : []}
                onToggle={(val) => {
                  updateVoteDraft({ ownerType: val as OwnerType })
                  goNext()
                }}
              />
            </div>
          </div>
        )}

        {step === 'landowner' && (
          <LandownerStep
            value={draft.landowner ?? {}}
            onChange={(patch) => updateVoteDraft({ landowner: { ...draft.landowner, ...patch } })}
            onNext={goNext}
          />
        )}

        {step === 'pay_band' && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Would you stay here?</h2>
            <div className="mt-3">
              <ChoiceButtons
                options={payBandOptions}
                selected={draft.payBand ? [draft.payBand] : []}
                onToggle={(value) => {
                  updateVoteDraft({ payBand: value as PayBand })
                  goNext()
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LandownerStep({
  value,
  onChange,
  onNext,
}: {
  value: { ownerNameOrOrg?: string; howKnown?: HowKnown; contact?: string; happyToBeContacted?: boolean }
  onChange: (patch: Partial<typeof value>) => void
  onNext: () => void
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">A bit about the owner</h2>
      <p className="mt-1 text-sm text-slate-500">Kept private — used for outreach only.</p>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Owner's name or organisation
      </label>
      <input
        type="text"
        value={value.ownerNameOrOrg ?? ''}
        onChange={(e) => onChange({ ownerNameOrOrg: e.target.value })}
        className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-base"
      />

      <p className="mt-4 text-sm font-medium text-slate-700">How do you know this?</p>
      <div className="mt-2">
        <ChoiceButtons
          options={howKnownOptions}
          selected={value.howKnown ? [value.howKnown] : []}
          onToggle={(val) => onChange({ howKnown: val as HowKnown })}
        />
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-6 w-full rounded-xl bg-teal-600 py-3.5 text-base font-semibold text-white active:bg-teal-700"
      >
        Continue
      </button>
    </div>
  )
}
