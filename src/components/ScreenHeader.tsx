import { useNavigate } from 'react-router-dom'

export function ScreenHeader({
  title,
  onBack,
  logo = false,
}: {
  title: string
  /** Defaults to browser back. Pass a function for a custom step-back action, or false to hide the button. */
  onBack?: (() => void) | false
  /** Shows the dark-blue AireStop wordmark, natural colour, at the header's right end. */
  logo?: boolean
}) {
  const navigate = useNavigate()
  const handleBack = onBack === false ? undefined : onBack ?? (() => navigate(-1))

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
      {handleBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
        >
          ←
        </button>
      )}
      <h1 className="font-display text-base font-semibold text-slate-900">{title}</h1>
      {logo && (
        <img
          src="https://airestop.co.uk/logo.svg"
          alt="AireStop"
          className="ml-auto h-6 w-[149px] shrink-0"
        />
      )}
    </header>
  )
}
