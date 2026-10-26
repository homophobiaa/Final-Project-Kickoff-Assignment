import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { bytes, int, pad, splitPath } from '../../lib/format'
import { useEngine } from '../../state/engine'
import { AnimatedNumber } from '../common/AnimatedNumber'
import { SectionHeader } from '../common/SectionHeader'
import './QueuePanel.css'

const VISIBLE = 40

export function QueuePanel() {
  const queue = useEngine((s) => s.snapshot?.queue)
  const scanning = useEngine((s) => s.snapshot?.isScanning ?? false)
  const status = useEngine((s) => s.snapshot?.status)
  const head = queue?.head.slice(0, VISIBLE) ?? []
  const count = queue?.count ?? 0
  const hidden = Math.max(0, count - head.length)

  return (
    <aside className="queue" aria-label="Waiting jobs">
      <SectionHeader index="05" title="Queue" meta={scanning ? <span className="queue__scanning">scanning</span> : 'waiting'} />

      <div className="queue__count">
        <AnimatedNumber value={count} className="display num" />
        <span className="label">images waiting</span>
      </div>

      <div className={clsx('filmstrip', status === 'Paused' && 'is-paused')}>
        <ol className="filmstrip__frames">
          <AnimatePresence initial={false}>
            {head.map((job) => {
              const { dir, name } = splitPath(job.relativePath)
              return (
                <motion.li
                  key={job.id}
                  layout="position"
                  className="frame"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -48, transition: { duration: 0.26, ease: [0.55, 0, 1, 0.45] } }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="frame__no mono num">{pad(job.id, 4)}</span>
                  <span className="frame__body">
                    <span className="frame__name mono" title={job.relativePath}>
                      {name}
                    </span>
                    <span className="frame__meta mono">
                      {dir || '.'} · {bytes(job.sourceBytes)}
                    </span>
                  </span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ol>

        {count === 0 && (
          <p className="filmstrip__empty">
            {status === 'Running' || status === 'Paused' ? 'Everything is taken. The last frames are still developing.' : 'The queue is empty.'}
          </p>
        )}
        {hidden > 0 && <p className="filmstrip__more mono">+ {int(hidden)} more on the roll</p>}
      </div>
    </aside>
  )
}
