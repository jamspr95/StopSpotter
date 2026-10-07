import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChoiceButtons } from '../components/ChoiceButtons'
import { ProgressBar } from '../components/ProgressBar'
import { ScreenHeader } from '../components/ScreenHeader'
import { howKnownOptions, nominationQuestions, payBandOptions } from '../data/questions'
import { useAppStore, type DraftNomination } from '../store/useAppStore'
import type { HowKnown, PayBand } from '../types'

type Step =
  | { kind: 'question'; index: number }
  | { kind: 'landowner' }
  | { kind: 'why_here' }
  | { kind: 'demand' }

export function NominationFormScreen() {
  const navigate = useNavigate()
  const pendingFlow = useAppStore((s) => s.pendingFlow)
  const updateNominationDraft = useAppStore((s) => s.updateNominationDraft)
  const [stepIndex, setStepIndex] = useState(0)
  const [whyHereDraft, setWhyHereDraft] = useState('')

  const draft = pendingFlow?.type === 'nomination' ? pendingFlow.draft : null

  const steps = useMemo<Step[]>(() => {
    const questionSteps: Step[] = nominationQuestions.map((_, index) => ({
      kind: 'question',
      index,
    }))
    const includeLandowner = draft?.answers.ownerType && draft.answers.ownerType !== 'dont_know'
    return [
      ...questionSteps,
      ...(includeLandowner ? [{ kind: 'landowner' } as Step] : []),
      { kind: 'why_here' },
      { kind: 'demand' },
    ]
  }, [draft])

  useEffect(() => {
    if (!draft) navigate('/spot')
  }, [draft, navigate])

  if (!draft) return null

  const step = steps[stepIndex]

  function goNext() {
    if (stepIndex + 1 >= steps.length) {
      navigate('/spot/signup')
    } else {
      setStepIndex((i) => i + 1)
    }
  }

  function goBackStep() {
    if (stepIndex === 0) {
      navigate(-1)
    } else {
      setStepIndex((i) => i - 1)
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title="Nominate a stop" onBack={goBackStep} />
      <ProgressBar step={stepIndex} total={steps.length} />

      <div className="flex-1 overflow-y-auto p-4">
        {step.kind === 'question' && (
          <QuestionStep
            questionIndex={step.index}
            value={draft}
            onAnswer={(key, value) => {
              updateNominationDraft({
                answers: { ...draft.answers, [key]: value } as Partial<DraftNomination['answers']>,
              })
              goNext()
            }}
            onAnswerMulti={(key, values) =>
              updateNominationDraft({
                answers: { ...draft.answers, [key]: values } as Partial<DraftNomination['answers']>,
              })
            }
            onNext={goNext}
          />
        )}

        {step.kind === 'landowner' && (
          <LandownerStep
            value={draft.landowner ?? {}}
            onChange={(patch) =>
              updateNominationDraft({ landowner: { ...draft.landowner, ...patch } })
            }
            onNext={goNext}
          />
        )}

        {step.kind === 'why_here' && (
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Why here? (optional)</h2>
            <p className="mt-1 text-sm text-slate-500">
              Up to 280 characters. Shown on the public card once reviewed.
            </p>
            <textarea
              maxLength={280}
              rows={4}
              value={whyHereDraft}
              onChange={(e) => setWhyHereDraft(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-base"
              placeholder="Flat field behind the pub, farmer said walkers already use the gate…"
            />
            <button
              type="button"
              onClick={() => {
                updateNominationDraft({ whyHere: whyHereDraft || undefined })
                goNext()
              }}
              className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:bg-brand-700"
            >
              Continue
            </button>
          </div>
        )}

        {step.kind === 'demand' && (
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">Would you stay here?</h2>
            <div className="mt-3">
              <ChoiceButtons
                options={payBandOptions}
                selected={draft.payBand ? [draft.payBand] : []}
                onToggle={(value) => {
                  updateNominationDraft({ payBand: value as PayBand })
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

function QuestionStep({
  questionIndex,
  value,
  onAnswer,
  onAnswerMulti,
  onNext,
}: {
  questionIndex: number
  value: DraftNomination
  onAnswer: (key: string, value: string) => void
  onAnswerMulti: (key: string, values: string[]) => void
  onNext: () => void
}) {
  const q = nominationQuestions[questionIndex]
  const currentAnswer = value.answers[q.id]

  if (q.type === 'multi') {
    const selected = Array.isArray(currentAnswer) ? (currentAnswer as string[]) : []
    return (
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900">{q.prompt}</h2>
        {q.hint && <p className="mt-1 text-sm text-slate-500">{q.hint}</p>}
        <div className="mt-3">
          <ChoiceButtons
            options={q.options}
            multi
            selected={selected}
            onToggle={(val) => {
              const next = selected.includes(val)
                ? selected.filter((v) => v !== val)
                : [...selected, val]
              onAnswerMulti(q.id, next)
            }}
          />
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={selected.length === 0}
          className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-slate-900">{q.prompt}</h2>
      {q.hint && <p className="mt-1 text-sm text-slate-500">{q.hint}</p>}
      <div className="mt-3">
        <ChoiceButtons
          options={q.options}
          selected={typeof currentAnswer === 'string' ? [currentAnswer] : []}
          onToggle={(val) => onAnswer(q.id, val)}
        />
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
      <h2 className="font-display text-lg font-semibold text-slate-900">A bit about the owner</h2>
      <p className="mt-1 text-sm text-slate-500">
        This is kept private and used for outreach only — never shown publicly.
      </p>

      <label className="mt-4 block text-sm font-medium text-slate-700">
        Owner's name or organisation
      </label>
      <input
        type="text"
        value={value.ownerNameOrOrg ?? ''}
        onChange={(e) => onChange({ ownerNameOrOrg: e.target.value })}
        placeholder='e.g. "Hill Farm" or "Gwynedd Council"'
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

      {(value.howKnown === 'i_own_it' || value.howKnown === 'i_know_them') && (
        <>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Contact details (optional)
          </label>
          <input
            type="text"
            value={value.contact ?? ''}
            onChange={(e) => onChange({ contact: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-base"
          />
        </>
      )}

      {value.howKnown === 'i_own_it' && (
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={value.happyToBeContacted ?? false}
            onChange={(e) => onChange({ happyToBeContacted: e.target.checked })}
            className="h-5 w-5 rounded border-slate-300"
          />
          Happy for AireStop to contact you about this stop?
        </label>
      )}

      <button
        type="button"
        onClick={onNext}
        className="mt-6 w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white active:bg-brand-700"
      >
        Continue
      </button>
    </div>
  )
}
