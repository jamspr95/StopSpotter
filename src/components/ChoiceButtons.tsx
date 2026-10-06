import type { Option } from '../data/questions'

interface Props {
  options: Option[]
  multi?: boolean
  selected: string[]
  onToggle: (value: string) => void
}

export function ChoiceButtons({ options, multi = false, selected, onToggle }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left text-base transition-colors ${
              isSelected
                ? 'border-teal-600 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-800 active:bg-slate-50'
            }`}
          >
            <span>{opt.label}</span>
            {multi && (
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                  isSelected ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300'
                }`}
              >
                {isSelected ? '✓' : ''}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
