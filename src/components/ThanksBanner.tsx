import { useEffect, useState } from 'react'

/**
 * A dismissible toast banner, not a page — used where a confirmation
 * should feel instant (e.g. the Support page's growth feedback options)
 * rather than navigating the user away to a dedicated thank-you screen.
 */
export function ThanksBanner({ message, onDone }: { message: string; onDone: () => void }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const enter = requestAnimationFrame(() => setEntered(true))
    const timer = setTimeout(onDone, 3500)
    return () => {
      cancelAnimationFrame(enter)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount, not on every onDone identity change
  }, [])

  return (
    <div
      role="status"
      className={`fixed inset-x-4 bottom-6 z-40 flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <span aria-hidden="true" className="text-base">✓</span>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDone}
        aria-label="Dismiss"
        className="text-white/70 active:text-white"
      >
        ✕
      </button>
    </div>
  )
}
