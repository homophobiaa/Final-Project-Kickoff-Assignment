import { memo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { duration, pad, splitPath } from '../../lib/format'
import type { JobStage, WorkerSnapshot } from '../../lib/types'
import { useEngine } from '../../state/engine'
import { useSettings } from '../../state/settings'
import { ScrambleText } from '../common/ScrambleText'
import { SectionHeader } from '../common/SectionHeader'
import './WorkersPanel.css'

const STAGES: { stage: JobStage; short: string; from: number; to: number }[] = [
  { stage: 'Decoding', short: 'Decode', from: 0, to: 0.4 },
  { stage: 'Resizing', short: 'Resize', from: 0.4, to: 0.7 },
  { stage: 'Encoding', short: 'Encode', from: 0.7, to: 0.92 },
  { stage: 'Writing', short: 'Write', from: 0.92, to: 1 },
]

const STATE_COPY: Record<string, string> = {
  Idle: 'idle',
  Waiting: 'waiting for job',
  Working: 'working',
  Paused: 'paused',
  Finished: 'finished',
}

export function WorkersPanel() {
  const workers = useEngine((s) => s.snapshot?.workers)
  const status = useEngine((s) => s.snapshot?.status)
  const elapsed = useEngine((s) => s.snapshot?.elapsedMs ?? 0)
  const plannedCount = useSettings((s) => s.workerCount)

  // Before the first run, show the lanes the next run would get, so the worker count is tangible.
  const lanes: WorkerSnapshot[] =
    workers && workers.length > 0
      ? workers
      : Array.from({ length: plannedCount }, (_, i) => ({
          id: i + 1,
          state: 'Idle',
          jobId: null,
          relativePath: null,
          jobStartedAtMs: 0,
          stage: 'None',
          progress: 0,
          succeeded: 0,
          failed: 0,
          busyMs: 0,
        }))

  const busy = lanes.filter((w) => w.state === 'Working').length

  return (
    <section className="workers">
      <SectionHeader
        index="02"
        title="Workers"
        meta={
          <>
            {busy}/{lanes.length} busy
          </>
        }
      />
      <motion.div layout className={clsx('workers__grid', lanes.length > 12 && 'is-dense')}>
        <AnimatePresence initial={false}>
          {lanes.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} elapsed={elapsed} paused={status === 'Paused'} dense={lanes.length > 12} />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  )
}

const WorkerCard = memo(function WorkerCard({
  worker,
  elapsed,
  paused,
  dense,
}: {
  worker: WorkerSnapshot
  elapsed: number
  paused: boolean
  dense: boolean
}) {
  const hasJob = worker.jobId !== null && worker.relativePath !== null
  const { dir, name } = hasJob ? splitPath(worker.relativePath!) : { dir: '', name: '' }
  const state = worker.state.toLowerCase()
  const jobTime = hasJob ? Math.max(0, elapsed - worker.jobStartedAtMs) : 0

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={clsx('worker', `worker--${state}`, paused && hasJob && 'worker--paused')}
    >
      <header className="worker__head">
        <span className="worker__id mono">W{pad(worker.id)}</span>
        <span className="worker__state mono">{STATE_COPY[worker.state]}</span>
        <span className="worker__tally mono num" title={`${worker.succeeded} developed, ${worker.failed} failed`}>
          {worker.succeeded}
          {worker.failed > 0 && <em> · {worker.failed}✕</em>}
        </span>
      </header>

      <div className="worker__file">
        {hasJob ? (
          <>
            {!dense && <span className="worker__dir mono">{dir || '.'}/</span>}
            <ScrambleText text={name} className="worker__name mono" />
          </>
        ) : (
          <span className="worker__placeholder mono">{worker.state === 'Finished' ? 'Done.' : '—'}</span>
        )}
      </div>

      <div className="stage-bar" aria-hidden="true">
        {STAGES.map((s) => {
          const fill = hasJob ? Math.min(1, Math.max(0, (worker.progress - s.from) / (s.to - s.from))) : 0
          const current = hasJob && worker.stage === s.stage
          return (
            <span key={s.stage} className={clsx('stage', current && 'is-current', fill >= 1 && 'is-done')} style={{ flexGrow: (s.to - s.from) * 10 }}>
              <span className="stage__fill" style={{ transform: `scaleX(${fill})` }} />
              {!dense && <span className="stage__label mono">{s.short}</span>}
            </span>
          )
        })}
      </div>

      {!dense && (
        <footer className="worker__foot mono num">
          <span>{hasJob ? `${Math.round(worker.progress * 100)}%` : ''}</span>
          <span>{hasJob ? duration(jobTime) : worker.busyMs ? `busy ${duration(worker.busyMs)}` : ''}</span>
        </footer>
      )}
    </motion.article>
  )
})
