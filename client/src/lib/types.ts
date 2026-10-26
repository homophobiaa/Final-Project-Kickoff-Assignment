// Mirrors the C# records in Safelight.Core.Engine (serialised as camelCase with string enums).

export type EngineStatus = 'Idle' | 'Running' | 'Paused' | 'Stopping' | 'Completed' | 'Stopped'
export type WorkerState = 'Idle' | 'Waiting' | 'Working' | 'Paused' | 'Finished'
export type JobStage = 'None' | 'Decoding' | 'Resizing' | 'Encoding' | 'Writing'
export type JobOutcome = 'Succeeded' | 'Failed' | 'Cancelled'
export type OutputFormat = 'Original' | 'Jpeg' | 'Png' | 'Webp'

export interface ResizeOptions {
  width: number
  height: number
  keepAspectRatio: boolean
  allowUpscale: boolean
  format: OutputFormat
  quality: number
}

export interface RunSettings {
  sourceFolder: string
  outputFolder: string
  workerCount: number
  resize: ResizeOptions
  simulatedLatencyMs: number
}

export interface ResizeJob {
  id: number
  sourcePath: string
  relativePath: string
  sourceBytes: number
}

export interface WorkerSnapshot {
  id: number
  state: WorkerState
  jobId: number | null
  relativePath: string | null
  jobStartedAtMs: number
  stage: JobStage
  progress: number
  succeeded: number
  failed: number
  busyMs: number
}

export interface JobResult {
  jobId: number
  relativePath: string
  sourcePath: string
  outputPath: string | null
  outcome: JobOutcome
  workerId: number
  startedAtMs: number
  finishedAtMs: number
  sourceBytes: number
  outputBytes: number
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  error: string | null
}

export interface RunStats {
  discovered: number
  succeeded: number
  failed: number
  cancelled: number
  bytesIn: number
  bytesOut: number
}

export interface PauseInterval {
  startMs: number
  endMs: number | null
}

export interface Snapshot {
  runId: string | null
  status: EngineStatus
  isScanning: boolean
  elapsedMs: number
  settings: RunSettings | null
  workers: WorkerSnapshot[]
  queue: { count: number; head: ResizeJob[] }
  stats: RunStats
  pauses: PauseInterval[]
  resultCount: number
  resultsFrom: number
  results: JobResult[]
  scanError: string | null
}

export interface Defaults {
  sampleFolder: string
  outputFolder: string
  processorCount: number
  maxWorkers: number
  maxSimulatedLatencyMs: number
  sampleRollReady: boolean
}

export interface FolderEntry {
  name: string
  path: string
  kind: 'place' | 'drive' | 'folder'
}

export interface FolderListing {
  path: string | null
  parent: string | null
  entries: FolderEntry[]
  imageCount: number
}

export const isActive = (status: EngineStatus | undefined) =>
  status === 'Running' || status === 'Paused' || status === 'Stopping'
