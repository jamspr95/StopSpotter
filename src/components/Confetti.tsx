import { useEffect, useMemo, useState } from 'react'

const COLOURS = ['#10385a', '#1d4e78', '#f5b942', '#e8594a', '#3fa796']
const PIECE_COUNT = 50

/**
 * Dependency-free confetti burst. Renders a fixed number of absolutely
 * positioned spans that fall and spin via the confetti-fall keyframe
 * (src/index.css), then calls onDone once the longest piece finishes.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const [visible, setVisible] = useState(true)
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        colour: COLOURS[i % COLOURS.length],
        delay: Math.random() * 0.4,
        duration: 2.4 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 120,
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
      })),
    [],
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onDone?.()
    }, 3200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once, not on every onDone identity change
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-10px] block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.colour,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            '--confetti-drift': `${p.drift}px`,
            '--confetti-rotate': `${p.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
