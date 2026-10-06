export function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = total > 0 ? Math.round(((step + 1) / total) * 100) : 0
  return (
    <div className="h-1.5 w-full bg-teal-100">
      <div
        className="h-1.5 bg-teal-600 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
