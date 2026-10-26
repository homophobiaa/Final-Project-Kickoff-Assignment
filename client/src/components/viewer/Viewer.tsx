import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { api, imageUrl, thumbUrl } from '../../lib/api'
import { bytes, dims, duration, pad, splitPath } from '../../lib/format'
import type { JobResult } from '../../lib/types'
import { useEngine } from '../../state/engine'
import { useUi } from '../../state/ui'
import { Icon } from '../common/Icon'
import { useFilteredResults } from '../results/useFilteredResults'
import './Viewer.css'

export function Viewer() {
  const jobId = useUi((s) => s.viewing)
  const view = useUi((s) => s.view)
  const filtered = useFilteredResults()
  const all = useEngine((s) => s.results)

  const list = filtered.some((r) => r.jobId === jobId) ? filtered : all
  const index = list.findIndex((r) => r.jobId === jobId)
  const item = index >= 0 ? list[index] : null

  useEffect(() => {
    if (jobId === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') view(null)
      if (e.key === 'ArrowRight' && index < list.length - 1) view(list[index + 1].jobId)
      if (e.key === 'ArrowLeft' && index > 0) view(list[index - 1].jobId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobId, index, list, view])

  return (
    <AnimatePresence>
      {item && (
        <motion.div className="viewer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} onClick={() => view(null)} role="dialog" aria-modal="true" aria-label="Image comparison">
          <motion.div
            className="viewer__panel"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="viewer__stage">
              {item.outcome === 'Succeeded' && item.outputPath ? <Compare key={item.jobId} item={item} /> : <FailedStage item={item} />}
              <button className="viewer__nav viewer__nav--prev" disabled={index <= 0} onClick={() => view(list[index - 1].jobId)} aria-label="Previous">
                <Icon name="chevronLeft" size={18} />
              </button>
              <button className="viewer__nav viewer__nav--next" disabled={index >= list.length - 1} onClick={() => view(list[index + 1].jobId)} aria-label="Next">
                <Icon name="chevronRight" size={18} />
              </button>
            </div>
            <Details item={item} position={`${index + 1} / ${list.length}`} onClose={() => view(null)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Compare({ item }: { item: JobResult }) {
  const runId = useEngine((s) => s.snapshot?.runId ?? '')
  const [split, setSplit] = useState(50)
  const [ready, setReady] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const move = (e: PointerEvent) => {
    if (!dragging.current) return
    const rect = ref.current!.getBoundingClientRect()
    setSplit(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)))
  }

  return (
    <div
      ref={ref}
      className="compare"
      onPointerDown={(e) => {
        dragging.current = true
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={move}
      onPointerUp={() => (dragging.current = false)}
    >
      <img className="compare__img" src={thumbUrl(item.sourcePath, 1024, runId)} alt="Original" draggable={false} onLoad={() => setReady((r) => r + 1)} />
      <img
        className="compare__img compare__img--after"
        src={imageUrl(item.outputPath!, runId)}
        alt="Resized"
        draggable={false}
        style={{ clipPath: `inset(0 0 0 ${split}%)` }}
        onLoad={() => setReady((r) => r + 1)}
      />
      {ready < 2 && <span className="compare__loading mono">developing…</span>}

      <div className="compare__handle" style={{ left: `${split}%` }}>
        <span className="compare__grip">
          <Icon name="compare" size={14} />
        </span>
      </div>

      <span className="compare__tag compare__tag--before mono">
        Original · {dims(item.sourceWidth, item.sourceHeight)} · {bytes(item.sourceBytes)}
      </span>
      <span className="compare__tag compare__tag--after mono">
        Resized · {dims(item.outputWidth, item.outputHeight)} · {bytes(item.outputBytes)}
      </span>
    </div>
  )
}

function FailedStage({ item }: { item: JobResult }) {
  return (
    <div className="viewer__failed">
      <Icon name="cross" size={28} />
      <p className="display">{item.outcome === 'Cancelled' ? 'Stopped before it finished.' : 'This one did not develop.'}</p>
      <code className="mono">{item.error}</code>
    </div>
  )
}

function Details({ item, position, onClose }: { item: JobResult; position: string; onClose: () => void }) {
  const toast = useUi((s) => s.toast)
  const { dir, name } = splitPath(item.relativePath)
  const saved = item.outputBytes && item.sourceBytes ? 1 - item.outputBytes / item.sourceBytes : null
  const scale = item.sourceWidth ? item.outputWidth / item.sourceWidth : null

  const reveal = async (path: string) => {
    try {
      await api.reveal(path)
    } catch (error) {
      toast('error', 'Could not open Explorer', (error as Error).message)
    }
  }

  return (
    <aside className="details">
      <header className="details__head">
        <span className="label">
          Frame {pad(item.jobId, 3)} · {position}
        </span>
        <button className="btn btn--ghost btn--small" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </header>
      <h3 className="details__name display">{name}</h3>
      <p className="details__dir mono">{dir || '.'}</p>

      <dl className="details__list">
        <Row term="Status" value={item.outcome === 'Succeeded' ? 'Developed' : item.outcome} tone={item.outcome} />
        <Row term="Thread" value={`W${pad(item.workerId)}`} />
        <Row term="Started" value={`${(item.startedAtMs / 1000).toFixed(2)} s into the run`} />
        <Row term="Took" value={duration(item.finishedAtMs - item.startedAtMs)} />
        <Row term="Source" value={`${dims(item.sourceWidth, item.sourceHeight)} · ${bytes(item.sourceBytes)}`} />
        {item.outcome === 'Succeeded' && (
          <>
            <Row term="Output" value={`${dims(item.outputWidth, item.outputHeight)} · ${bytes(item.outputBytes)}`} />
            <Row term="Scale" value={scale ? `${(scale * 100).toFixed(1)}%` : '—'} />
            <Row term="Saved" value={saved !== null ? `${(saved * 100).toFixed(1)}%` : '—'} />
          </>
        )}
      </dl>

      {item.outcome === 'Succeeded' && (
        <div className="details__bar" aria-hidden="true">
          <span style={{ width: `${Math.max(1, (1 - (saved ?? 0)) * 100)}%` }} />
        </div>
      )}

      <div className="details__actions">
        {item.outputPath && (
          <button className="btn btn--small" onClick={() => reveal(item.outputPath!)}>
            <Icon name="reveal" size={13} /> Show output
          </button>
        )}
        <button className="btn btn--small btn--ghost" onClick={() => reveal(item.sourcePath)}>
          <Icon name="reveal" size={13} /> Show original
        </button>
      </div>
      <p className="details__hint mono">← → to browse · Esc to close · drag to compare</p>
    </aside>
  )
}

function Row({ term, value, tone }: { term: string; value: string; tone?: string }) {
  return (
    <div className="details__row">
      <dt className="label">{term}</dt>
      <dd className={`mono num ${tone ? `is-${tone.toLowerCase()}` : ''}`}>{value}</dd>
    </div>
  )
}
