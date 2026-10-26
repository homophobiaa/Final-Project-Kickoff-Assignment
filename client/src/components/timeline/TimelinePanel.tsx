import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { duration, pad, splitPath } from '../../lib/format'
import type { JobOutcome } from '../../lib/types'
import { useEngine } from '../../state/engine'
import { useUi } from '../../state/ui'
import { SectionHeader } from '../common/SectionHeader'
import './TimelinePanel.css'

const GUTTER_LEFT = 40
const GUTTER_RIGHT = 46
const AXIS = 20
const TICK_STEPS = [250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]

interface Hit {
  x: number
  y: number
  w: number
  h: number
  jobId: number | null
  name: string
  worker: number
  ms: number
  outcome: JobOutcome | 'Active'
}

interface Tip {
  left: number
  top: number
  hit: Hit
}

/**
 * Swimlane chart of the whole run: one lane per worker thread, one bar per image.
 * Drawn on a canvas in a requestAnimationFrame loop that reads the store directly, so a run with
 * thousands of jobs costs one draw call per bar and zero React re-renders per frame.
 */
export function TimelinePanel() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hits = useRef<Hit[]>([])
  const hover = useRef<{ x: number; y: number } | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const hasRun = useEngine((s) => s.snapshot?.runId != null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    const css = getComputedStyle(document.documentElement)
    const color = (name: string) => css.getPropertyValue(name).trim()
    const palette = {
      paper: color('--paper'),
      muted: color('--muted'),
      faint: color('--faint'),
      ghost: color('--ghost'),
      line: color('--line'),
      safe: color('--safe'),
      safeHi: color('--safe-hi'),
      amber: color('--amber'),
      dye: color('--dye'),
    }

    let width = 0
    let height = 0
    let frame = 0
    let lastKey = ''

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      width = wrap.clientWidth
      height = wrap.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      lastKey = ''
    }

    const hatch = (() => {
      const tile = document.createElement('canvas')
      tile.width = tile.height = 8
      const t = tile.getContext('2d')!
      t.strokeStyle = palette.amber
      t.globalAlpha = 0.22
      t.lineWidth = 1
      t.beginPath()
      t.moveTo(0, 8)
      t.lineTo(8, 0)
      t.stroke()
      return ctx.createPattern(tile, 'repeat')
    })()

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const { snapshot, receivedAt, results } = useEngine.getState()
      const live = snapshot?.status === 'Running' || snapshot?.status === 'Paused' || snapshot?.status === 'Stopping'
      const now = (snapshot?.elapsedMs ?? 0) + (live && snapshot?.status !== 'Paused' ? performance.now() - receivedAt : 0)

      const key = `${width}|${height}|${snapshot?.runId}|${results.length}|${snapshot?.status}|${hover.current?.x},${hover.current?.y}`
      if (!live && key === lastKey) return
      lastKey = key

      ctx.clearRect(0, 0, width, height)
      const workers = snapshot?.workers ?? []
      const lanes = Math.max(workers.length, 1)
      const plotW = Math.max(10, width - GUTTER_LEFT - GUTTER_RIGHT)
      const plotH = height - AXIS
      const laneH = plotH / lanes
      const span = Math.max(now * 1.04, 4000)
      const xOf = (ms: number) => GUTTER_LEFT + (ms / span) * plotW
      const barGap = laneH > 10 ? 2 : 1

      // lanes
      ctx.font = `500 10px ${css.getPropertyValue('--font-mono')}`
      ctx.textBaseline = 'middle'
      for (let i = 0; i < lanes; i++) {
        const y = AXIS + i * laneH
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(239, 230, 216, 0.018)'
          ctx.fillRect(GUTTER_LEFT, y, plotW, laneH)
        }
        if (laneH >= 9 && workers.length) {
          ctx.fillStyle = palette.muted
          ctx.textAlign = 'left'
          ctx.fillText(`W${pad(i + 1)}`, 4, y + laneH / 2)
        }
      }

      // time axis
      const step = TICK_STEPS.find((s) => (s / span) * plotW >= 70) ?? TICK_STEPS[TICK_STEPS.length - 1]
      ctx.textAlign = 'center'
      for (let t = 0; t <= span; t += step) {
        const x = xOf(t)
        ctx.fillStyle = palette.line
        ctx.fillRect(Math.round(x), AXIS - 4, 1, plotH + 4)
        ctx.fillStyle = palette.faint
        ctx.fillText(t >= 60_000 ? `${(t / 60_000).toFixed(t % 60_000 ? 1 : 0)}m` : `${t / 1000}s`, x, 8)
      }

      // pauses
      for (const p of snapshot?.pauses ?? []) {
        const x0 = xOf(p.startMs)
        const x1 = xOf(p.endMs ?? now)
        ctx.fillStyle = 'rgba(242, 164, 58, 0.06)'
        ctx.fillRect(x0, AXIS, Math.max(1, x1 - x0), plotH)
        if (hatch) {
          ctx.fillStyle = hatch
          ctx.fillRect(x0, AXIS, Math.max(1, x1 - x0), plotH)
        }
        ctx.fillStyle = palette.amber
        ctx.fillRect(x0, AXIS, 1, plotH)
      }

      // finished jobs
      const nextHits: Hit[] = []
      const busy = new Array<number>(lanes).fill(0)
      const h = hover.current
      for (const r of results) {
        const lane = r.workerId - 1
        busy[lane] += r.finishedAtMs - r.startedAtMs
        const x = xOf(r.startedAtMs)
        const w = Math.max(1.5, xOf(r.finishedAtMs) - x - 1)
        const y = AXIS + lane * laneH + barGap
        const bh = Math.max(1, laneH - barGap * 2)
        const hovered = h && h.x >= x && h.x <= x + w && h.y >= y && h.y <= y + bh

        if (r.outcome === 'Succeeded') {
          ctx.fillStyle = palette.paper
          ctx.globalAlpha = hovered ? 1 : 0.5
        } else if (r.outcome === 'Failed') {
          ctx.fillStyle = palette.dye
          ctx.globalAlpha = hovered ? 1 : 0.85
        } else {
          ctx.fillStyle = palette.faint
          ctx.globalAlpha = 0.9
        }
        ctx.fillRect(x, y, w, bh)
        ctx.globalAlpha = 1

        nextHits.push({ x, y, w, h: bh, jobId: r.jobId, name: r.relativePath, worker: r.workerId, ms: r.finishedAtMs - r.startedAtMs, outcome: r.outcome })
      }

      // jobs in flight: they grow in real time
      for (const w of workers) {
        if (w.jobId === null || w.relativePath === null) continue
        const lane = w.id - 1
        busy[lane] += now - w.jobStartedAtMs
        const x = xOf(w.jobStartedAtMs)
        const bw = Math.max(2, xOf(now) - x)
        const y = AXIS + lane * laneH + barGap
        const bh = Math.max(1, laneH - barGap * 2)
        const paused = w.state === 'Paused'

        const gradient = ctx.createLinearGradient(x, 0, x + bw, 0)
        gradient.addColorStop(0, paused ? 'rgba(242,164,58,0.25)' : 'rgba(255,74,43,0.25)')
        gradient.addColorStop(1, paused ? palette.amber : palette.safe)
        ctx.fillStyle = gradient
        ctx.shadowColor = paused ? palette.amber : palette.safe
        ctx.shadowBlur = 10
        ctx.fillRect(x, y, bw, bh)
        ctx.shadowBlur = 0
        ctx.fillStyle = paused ? palette.amber : palette.safeHi
        ctx.fillRect(x + bw - 2, y, 2, bh)

        nextHits.push({ x, y, w: bw, h: bh, jobId: null, name: w.relativePath, worker: w.id, ms: now - w.jobStartedAtMs, outcome: 'Active' })
      }

      // utilisation: share of the run each thread spent on a job
      if (workers.length && laneH >= 9) {
        ctx.textAlign = 'right'
        for (let i = 0; i < lanes; i++) {
          const share = now > 0 ? Math.min(1, busy[i] / now) : 0
          ctx.fillStyle = share > 0.8 ? palette.paper : palette.muted
          ctx.fillText(`${Math.round(share * 100)}%`, width - 4, AXIS + i * laneH + laneH / 2)
        }
      }

      // now line
      if (live) {
        const x = xOf(now)
        ctx.fillStyle = snapshot?.status === 'Paused' ? palette.amber : palette.safe
        ctx.fillRect(x, AXIS - 6, 1, plotH + 6)
        ctx.beginPath()
        ctx.moveTo(x - 4, AXIS - 8)
        ctx.lineTo(x + 5, AXIS - 8)
        ctx.lineTo(x + 0.5, AXIS - 2)
        ctx.fill()
      }

      hits.current = nextHits
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const findHit = (x: number, y: number) => {
    const list = hits.current
    for (let i = list.length - 1; i >= 0; i--) {
      const hit = list[i]
      if (x >= hit.x && x <= hit.x + Math.max(hit.w, 3) && y >= hit.y && y <= hit.y + hit.h) return hit
    }
    return null
  }

  const onMove = (e: PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    hover.current = { x, y }
    const hit = findHit(x, y)
    setTip(hit ? { left: Math.min(x + 14, rect.width - 220), top: Math.max(0, y - 54), hit } : null)
  }

  const onLeave = () => {
    hover.current = null
    setTip(null)
  }

  const onClick = (e: PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    const hit = findHit(e.clientX - rect.left, e.clientY - rect.top)
    if (hit?.jobId != null) useUi.getState().view(hit.jobId)
  }

  return (
    <section className="timeline-panel">
      <SectionHeader
        index="03"
        title="Timeline"
        meta="one lane per thread · one bar per image"
        actions={
          <div className="timeline-legend mono">
            <span className="timeline-legend__item timeline-legend__item--active">in flight</span>
            <span className="timeline-legend__item timeline-legend__item--done">developed</span>
            <span className="timeline-legend__item timeline-legend__item--failed">failed</span>
            <span className="timeline-legend__item timeline-legend__item--paused">paused</span>
          </div>
        }
      />
      <div
        ref={wrapRef}
        className="timeline"
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerUp={onClick}
        style={{ cursor: tip?.hit.jobId != null ? 'pointer' : 'default' }}
      >
        <canvas ref={canvasRef} />
        {!hasRun && <p className="timeline__empty">Start a run to see how the threads share the work.</p>}
        {tip && (
          <div className="timeline__tip" style={{ left: tip.left, top: tip.top }}>
            <span className="mono timeline__tip-name">{splitPath(tip.hit.name).name}</span>
            <span className="mono timeline__tip-meta">
              W{pad(tip.hit.worker)} · {duration(tip.hit.ms)} · {tip.hit.outcome === 'Active' ? 'in flight' : tip.hit.outcome.toLowerCase()}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
