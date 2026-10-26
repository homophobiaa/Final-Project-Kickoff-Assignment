import { create } from 'zustand'
import type { JobResult, Snapshot } from '../lib/types'

export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline'

/** One sample of finished-job count over run time, used for throughput. */
interface Sample {
  t: number
  done: number
}

interface EngineStore {
  connection: Connection
  snapshot: Snapshot | null
  /** performance.now() when the snapshot arrived; lets the timeline interpolate between beats. */
  receivedAt: number
  results: JobResult[]
  history: Sample[]
  setConnection: (connection: Connection) => void
  ingest: (snapshot: Snapshot) => void
}

const MAX_HISTORY = 1200
let knownIds = new Set<number>()

export const useEngine = create<EngineStore>((set, get) => ({
  connection: 'connecting',
  snapshot: null,
  receivedAt: 0,
  results: [],
  history: [],

  setConnection: (connection) => set({ connection }),

  ingest: (snapshot) => {
    const previous = get()
    const newRun = previous.snapshot?.runId !== snapshot.runId
    if (newRun) knownIds = new Set()

    // Snapshots carry finished jobs as deltas; a full Sync after a reconnect may repeat some of them.
    const fresh = snapshot.results.filter((r) => !knownIds.has(r.jobId))
    fresh.forEach((r) => knownIds.add(r.jobId))
    const base = newRun ? [] : previous.results
    const results = fresh.length ? [...base, ...fresh] : base

    const done = snapshot.stats.succeeded + snapshot.stats.failed
    let history = newRun ? [] : previous.history
    const last = history[history.length - 1]
    if (snapshot.runId && (!last || snapshot.elapsedMs > last.t)) {
      history = [...history, { t: snapshot.elapsedMs, done }]
      if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY)
    }

    set({ snapshot: { ...snapshot, results: [] }, receivedAt: performance.now(), results, history })
  },
}))

/** Finished jobs per second over the trailing window, measured in run time. */
export function throughput(history: Sample[], windowMs = 2500): number {
  if (history.length < 2) return 0
  const last = history[history.length - 1]
  let first = history[0]
  for (let i = history.length - 1; i >= 0; i--) {
    first = history[i]
    if (last.t - history[i].t >= windowMs) break
  }
  const dt = last.t - first.t
  return dt > 0 ? ((last.done - first.done) * 1000) / dt : 0
}

/** Rate series for the sparkline: one value per `bucketMs` of run time. */
export function rateSeries(history: Sample[], bucketMs = 1000, buckets = 40): number[] {
  if (history.length < 2) return []
  const end = history[history.length - 1].t
  const series: number[] = []
  let j = history.length - 1
  for (let b = 0; b < buckets; b++) {
    const to = end - b * bucketMs
    const from = to - bucketMs
    if (from < 0) break
    const at = (t: number) => {
      while (j > 0 && history[j].t > t) j--
      return history[j].done
    }
    const upper = at(to)
    const lower = at(from)
    series.unshift(((upper - lower) * 1000) / bucketMs)
  }
  return series
}
