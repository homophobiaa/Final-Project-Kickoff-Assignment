import clsx from 'clsx'
import { bytes, duration } from '../../lib/format'
import { throughput, useEngine } from '../../state/engine'
import { AnimatedNumber } from '../common/AnimatedNumber'
import './StatsStrip.css'

export function StatsStrip() {
  const snapshot = useEngine((s) => s.snapshot)
  const history = useEngine((s) => s.history)
  if (!snapshot) return <div className="stats stats--loading" />

  const { stats, queue, workers, status, isScanning } = snapshot
  const inFlight = workers.filter((w) => w.jobId !== null).length
  const total = Math.max(stats.discovered, 1)
  const rate = throughput(history)
  const remaining = queue.count + inFlight
  const live = status === 'Running' || status === 'Paused'
  const eta = live && rate > 0 && !isScanning ? (remaining / rate) * 1000 : null
  const saved = stats.bytesIn > 0 ? 1 - stats.bytesOut / stats.bytesIn : 0

  const segment = (n: number) => `${(n / total) * 100}%`

  return (
    <section className="stats" aria-label="Run statistics">
      <div className="stats__tiles">
        <Tile label="Developed" tone="fix" value={stats.succeeded} />
        <Tile label="Failed" tone="dye" value={stats.failed} sub={stats.cancelled ? `${stats.cancelled} cancelled` : undefined} />
        <Tile label="In queue" value={queue.count} sub={inFlight ? `${inFlight} in flight` : undefined} />
        <Tile label="Found" value={stats.discovered} sub={isScanning ? 'scanning…' : undefined} pulse={isScanning} />
        <div className="tile">
          <span className="label">Data</span>
          <span className="tile__value tile__value--small mono num">
            {bytes(stats.bytesIn)} <span className="tile__arrow">→</span> {bytes(stats.bytesOut)}
          </span>
          <span className="tile__sub mono">{saved > 0 ? `${(saved * 100).toFixed(1)}% smaller` : '—'}</span>
        </div>
        <div className="tile">
          <span className="label">Remaining</span>
          <span className="tile__value tile__value--small mono num">{eta === null ? '—' : `~${duration(eta)}`}</span>
          <span className="tile__sub mono">{status === 'Paused' ? 'clock still running' : live ? 'at current rate' : ''}</span>
        </div>
      </div>

      <div
        className={clsx('progress', isScanning && 'is-scanning', status === 'Paused' && 'is-paused')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stats.discovered}
        aria-valuenow={stats.succeeded + stats.failed + stats.cancelled}
      >
        <span className="progress__seg progress__seg--done" style={{ width: segment(stats.succeeded) }} />
        <span className="progress__seg progress__seg--failed" style={{ width: segment(stats.failed) }} />
        <span className="progress__seg progress__seg--cancelled" style={{ width: segment(stats.cancelled) }} />
        <span className="progress__seg progress__seg--flight" style={{ width: segment(inFlight) }} />
      </div>
    </section>
  )
}

function Tile({ label, value, sub, tone, pulse }: { label: string; value: number; sub?: string; tone?: 'fix' | 'dye'; pulse?: boolean }) {
  return (
    <div className={clsx('tile', tone && `tile--${tone}`, pulse && 'tile--pulse')}>
      <span className="label">{label}</span>
      <AnimatedNumber value={value} className="tile__value display num" />
      <span className="tile__sub mono">{sub ?? ''}</span>
    </div>
  )
}
