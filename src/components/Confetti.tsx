import { useEffect, useMemo, useState } from 'react'

const COLOURS = ['#10385a', '#1d4e78', '#f5b942', '#e8594a', '#3fa796']
const PIECES_PER_CANNON = 32

interface Piece {
  id: string
  origin: 'left' | 'right'
  colour: string
  delay: number
  duration: number
  size: number
  burstX: number
  burstY: number
  fallX: number
  fallY: number
  rotate: number
}

/** One cannon's worth of pieces, firing up and across from a bottom corner. */
function buildCannon(origin: 'left' | 'right'): Piece[] {
  // Angle measured from straight up, tilted towards the opposite corner so
  // the two cannons' bursts cross over the middle of the screen.
  const baseAngle = origin === 'left' ? 35 : -35
  return Array.from({ length: PIECES_PER_CANNON }, (_, i) => {
    const angleDeg = baseAngle + (Math.random() - 0.5) * 50
    const angleRad = (angleDeg * Math.PI) / 180
    const dx = Math.sin(angleRad)
    const dy = -Math.cos(angleRad)
    const burstDistance = 140 + Math.random() * 220
    const burstX = dx * burstDistance
    const burstY = dy * burstDistance
    const fallDistance = 260 + Math.random() * 300

    return {
      id: `${origin}-${i}`,
      origin,
      colour: COLOURS[i % COLOURS.length],
      delay: Math.random() * 0.15,
      duration: 1.7 + Math.random() * 0.7,
      size: 6 + Math.random() * 6,
      burstX,
      burstY,
      fallX: burstX + dx * fallDistance * 0.3,
      fallY: burstY + fallDistance,
      rotate: 360 + Math.random() * 720,
    }
  })
}

/**
 * Dependency-free confetti cannon burst. Fires two bursts of pieces from
 * the bottom corners that shoot up and across before gravity takes over,
 * via the confetti-cannon keyframe (src/index.css) — a party-popper
 * moment rather than a steady fall. Calls onDone once the longest piece
 * finishes.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const [visible, setVisible] = useState(true)
  const pieces = useMemo(() => [...buildCannon('left'), ...buildCannon('right')], [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      onDone?.()
    }, 2600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once, not on every onDone identity change
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`absolute bottom-0 block rounded-sm ${p.origin === 'left' ? 'left-0' : 'right-0'}`}
          style={{
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.colour,
            animation: `confetti-cannon ${p.duration}s cubic-bezier(0.15, 0.6, 0.35, 1) ${p.delay}s forwards`,
            '--confetti-burst-x': `${p.burstX}px`,
            '--confetti-burst-y': `${p.burstY}px`,
            '--confetti-fall-x': `${p.fallX}px`,
            '--confetti-fall-y': `${p.fallY}px`,
            '--confetti-rotate': `${p.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
