import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import { thumbUrl } from '../../lib/api'
import { bytes, dims, duration, int, pad, splitPath } from '../../lib/format'
import type { JobResult } from '../../lib/types'
import { useEngine } from '../../state/engine'
import { useUi, type ResultFilter } from '../../state/ui'
import { Icon } from '../common/Icon'
import { SectionHeader } from '../common/SectionHeader'
import { useFilteredResults } from './useFilteredResults'
import './ResultsPanel.css'

const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'developed', label: 'Developed' },
  { value: 'failed', label: 'Failed' },
]

export function ResultsPanel() {
  const all = useEngine((s) => s.results)
  const items = useFilteredResults()
  const { resultFilter, resultQuery, resultView, set } = useUi()
  const failed = all.filter((r) => r.outcome !== 'Succeeded').length

  return (
    <section className="results">
      <SectionHeader
        index="04"
        title="Results"
        meta={`${int(items.length)} of ${int(all.length)}`}
        actions={
          <div className="view-switch" role="radiogroup" aria-label="Result view">
            <button role="radio" aria-checked={resultView === 'sheet'} className={clsx(resultView === 'sheet' && 'is-active')} onClick={() => set({ resultView: 'sheet' })} title="Contact sheet">
              <Icon name="grid" size={14} />
            </button>
            <button role="radio" aria-checked={resultView === 'ledger'} className={clsx(resultView === 'ledger' && 'is-active')} onClick={() => set({ resultView: 'ledger' })} title="Ledger">
              <Icon name="list" size={14} />
            </button>
          </div>
        }
      />

      <div className="results__toolbar">
        <div className="chips" role="radiogroup" aria-label="Filter results">
          {FILTERS.map((f) => (
            <button key={f.value} role="radio" aria-checked={resultFilter === f.value} className={clsx('chip', resultFilter === f.value && 'is-active')} onClick={() => set({ resultFilter: f.value })}>
              {f.label}
              {f.value === 'failed' && failed > 0 && <span className="chip__badge num">{failed}</span>}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={14} />
          <input className="search__input" placeholder="Filter by file name" value={resultQuery} onChange={(e) => set({ resultQuery: e.target.value })} />
        </label>
      </div>

      <div className="results__body">
        {all.length === 0 ? <EmptySheet /> : items.length === 0 ? <p className="results__none">Nothing matches that filter.</p> : resultView === 'sheet' ? <ContactSheet items={items} /> : <Ledger items={items} />}
      </div>
    </section>
  )
}

function EmptySheet() {
  return (
    <div className="empty-sheet">
      <div className="empty-sheet__frames" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </div>
      <p className="display">Your contact sheet develops here.</p>
      <p className="empty-sheet__hint">Pick a source folder, or paint a sample roll, then press Start.</p>
    </div>
  )
}

/* ---------------- contact sheet ---------------- */

const MIN_CELL = 190
const GAP = 10
const CAPTION = 50

function ContactSheet({ items }: { items: JobResult[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current!
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const columns = Math.max(1, Math.floor((width + GAP) / (MIN_CELL + GAP)))
  const cell = width > 0 ? (width - GAP * (columns - 1)) / columns : MIN_CELL
  const rowHeight = Math.round(cell * (2 / 3)) + CAPTION + GAP
  const rows = Math.ceil(items.length / columns)

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer])

  return (
    <div ref={scrollRef} className="sheet-scroll">
      <div className="sheet" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} className="sheet__row" style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, 1fr)`, height: rowHeight - GAP }}>
            {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
              <Print key={item.jobId} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Prints that already finished their develop animation, so scrolling back does not replay it. */
const developed = new Set<string>()

const Print = memo(function Print({ item }: { item: JobResult }) {
  const runId = useEngine((s) => s.snapshot?.runId ?? '')
  const view = useUi((s) => s.view)
  const key = `${runId}:${item.jobId}`
  const [loaded, setLoaded] = useState(developed.has(key))
  const ok = item.outcome === 'Succeeded' && item.outputPath
  const { name } = splitPath(item.relativePath)

  return (
    <motion.button
      className={clsx('print', !ok && 'print--failed')}
      onClick={() => view(item.jobId)}
      initial={developed.has(key) ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="print__image">
        {ok ? (
          <img
            src={thumbUrl(item.outputPath!, 360, runId)}
            alt={name}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={clsx(loaded && 'is-developed', developed.has(key) && 'no-anim')}
            onLoad={() => {
              setLoaded(true)
              window.setTimeout(() => developed.add(key), 1800)
            }}
          />
        ) : (
          <div className="print__failure">
            <Icon name="cross" size={18} />
            <span className="mono">{item.outcome === 'Cancelled' ? 'Cancelled' : 'Failed'}</span>
            <small>{item.error}</small>
          </div>
        )}
      </div>
      <div className="print__edge mono">
        <span>▸ {pad(item.jobId, 3)}A</span>
        <span>SAFELIGHT 400</span>
        <span>W{pad(item.workerId)}</span>
      </div>
      <div className="print__caption">
        <span className="print__name mono" title={item.relativePath}>
          {name}
        </span>
        <span className="print__dims mono num">{ok ? `${dims(item.outputWidth, item.outputHeight)} · ${bytes(item.outputBytes)}` : duration(item.finishedAtMs - item.startedAtMs)}</span>
      </div>
    </motion.button>
  )
})

/* ---------------- ledger ---------------- */

function Ledger({ items }: { items: JobResult[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const view = useUi((s) => s.view)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 12,
  })

  return (
    <div ref={scrollRef} className="ledger-scroll">
      <div className="ledger" role="table" aria-rowcount={items.length}>
        <div className="ledger__row ledger__row--head label" role="row">
          <span>#</span>
          <span>File</span>
          <span>Thread</span>
          <span>Source</span>
          <span>Output</span>
          <span>Size</span>
          <span>Saved</span>
          <span>Time</span>
          <span>Status</span>
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((row) => {
            const r = items[row.index]
            const saved = r.outputBytes && r.sourceBytes ? 1 - r.outputBytes / r.sourceBytes : null
            return (
              <div key={r.jobId} role="row" className={clsx('ledger__row', `is-${r.outcome.toLowerCase()}`)} style={{ transform: `translateY(${row.start}px)` }} onClick={() => view(r.jobId)}>
                <span className="mono num ledger__muted">{pad(r.jobId, 4)}</span>
                <span className="mono ledger__file" title={r.relativePath}>
                  {r.relativePath}
                </span>
                <span className="mono">W{pad(r.workerId)}</span>
                <span className="mono num ledger__muted">{dims(r.sourceWidth, r.sourceHeight)}</span>
                <span className="mono num">{dims(r.outputWidth, r.outputHeight)}</span>
                <span className="mono num ledger__muted">{r.outputBytes ? bytes(r.outputBytes) : '—'}</span>
                <span className="mono num">{saved !== null ? `${(saved * 100).toFixed(0)}%` : '—'}</span>
                <span className="mono num ledger__muted">{duration(r.finishedAtMs - r.startedAtMs)}</span>
                <span className="ledger__status mono" title={r.error ?? undefined}>
                  {r.outcome === 'Succeeded' ? 'developed' : r.outcome.toLowerCase()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
