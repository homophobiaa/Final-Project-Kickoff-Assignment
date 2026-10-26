import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { clock } from '../../lib/format'
import { rateSeries, throughput, useEngine } from '../../state/engine'
import { Icon } from '../common/Icon'
import { availableCommands, runCommand } from './controls'
import './Header.css'

const STATUS_COPY: Record<string, string> = {
  Idle: 'Ready',
  Running: 'Running',
  Paused: 'Paused',
  Stopping: 'Stopping',
  Completed: 'Complete',
  Stopped: 'Stopped',
}

export function Header() {
  const status = useEngine((s) => s.snapshot?.status ?? 'Idle')
  const connection = useEngine((s) => s.connection)
  const online = connection === 'online'
  const can = availableCommands(status, online)

  return (
    <header className="header">
      <div className="header__brand">
        <Lamp status={status} />
        <span className="header__wordmark display">Safelight</span>
        <span className="header__tag label">Parallel image resizer</span>
      </div>

      <div className="header__readouts">
        <div className="readout">
          <span className="label">Status</span>
          <span className={clsx('readout__status', `is-${status.toLowerCase()}`)}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={online ? status : connection}
                initial={{ y: 10, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -10, opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {online ? STATUS_COPY[status] : connection === 'connecting' ? 'Connecting' : 'Engine offline'}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
        <div className="readout">
          <span className="label">Run clock</span>
          <LiveClock />
        </div>
        <Throughput />
      </div>

      <nav className="header__controls" aria-label="Run controls">
        <button className="btn btn--primary" disabled={!can.start} onClick={() => runCommand('start')}>
          <Icon name="play" size={14} /> Start <span className="kbd">S</span>
        </button>
        <button className="btn" disabled={!can.pause} onClick={() => runCommand('pause')}>
          <Icon name="pause" size={14} /> Pause <span className="kbd">P</span>
        </button>
        <button className={clsx('btn', can.resume && 'btn--attention')} disabled={!can.resume} onClick={() => runCommand('resume')}>
          <Icon name="resume" size={14} /> Resume <span className="kbd">R</span>
        </button>
        <button className="btn" disabled={!can.stop} onClick={() => runCommand('stop')}>
          <Icon name="stop" size={14} /> Stop <span className="kbd">X</span>
        </button>
      </nav>
    </header>
  )
}

function Lamp({ status }: { status: string }) {
  return (
    <span className={clsx('lamp', `lamp--${status.toLowerCase()}`)} aria-hidden="true">
      <span className="lamp__bulb" />
      <span className="lamp__halo" />
    </span>
  )
}

/** Ticks every frame while a run is live, interpolating between 10 Hz snapshots. Writes the DOM directly. */
function LiveClock() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let frame = 0
    const paint = () => {
      const { snapshot, receivedAt } = useEngine.getState()
      const live = snapshot?.status === 'Running' || snapshot?.status === 'Paused' || snapshot?.status === 'Stopping'
      const ms = (snapshot?.elapsedMs ?? 0) + (live ? performance.now() - receivedAt : 0)
      if (ref.current) ref.current.textContent = clock(ms)
      frame = requestAnimationFrame(paint)
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <span ref={ref} className="readout__clock mono num" />
}

function Throughput() {
  const history = useEngine((s) => s.history)
  const series = rateSeries(history, 1000, 36)
  const rate = throughput(history)

  const width = 112
  const height = 28
  const max = Math.max(1, ...series)
  const points = series.map((v, i) => [
    series.length === 1 ? width : (i / (series.length - 1)) * width,
    height - 2 - (v / max) * (height - 6),
  ])
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const area = points.length ? `${line}L${width},${height}L0,${height}Z` : ''

  return (
    <div className="readout readout--throughput">
      <span className="label">Throughput</span>
      <div className="throughput">
        <svg width={width} height={height} className="throughput__spark" aria-hidden="true">
          <defs>
            <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--safe)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--safe)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--line-strong)" />
          {area && <path d={area} fill="url(#spark-fill)" />}
          {line && <path d={line} fill="none" stroke="var(--safe)" strokeWidth="1.3" strokeLinejoin="round" />}
          {points.length > 0 && <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.2" fill="var(--safe-hi)" />}
        </svg>
        <span className="throughput__value mono num">
          {rate.toFixed(1)}
          <small> img/s</small>
        </span>
      </div>
    </div>
  )
}
