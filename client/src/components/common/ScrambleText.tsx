import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

const GLYPHS = '░▒▓/\\|<>-_=+*#0123456789abcdef'

/**
 * Resolves new text left-to-right through a brief burst of noise glyphs,
 * like a split-flap display, whenever `text` changes.
 */
export function ScrambleText({ text, duration = 380, className }: { text: string; duration?: number; className?: string }) {
  const [shown, setShown] = useState(text)
  const reduced = useReducedMotion()
  const frame = useRef(0)

  useEffect(() => {
    if (reduced) return

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const settled = Math.floor(text.length * t)
      let next = text.slice(0, settled)
      for (let i = settled; i < text.length; i++) {
        next += text[i] === ' ' || text[i] === '/' ? text[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0]
      }
      setShown(next)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [text, duration, reduced])

  return (
    <span className={className} title={text}>
      {reduced ? text : shown}
    </span>
  )
}
