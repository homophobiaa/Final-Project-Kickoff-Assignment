import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useEngine } from '../state/engine'
import { useUi } from '../state/ui'
import type { RunSettings, Snapshot } from './types'

const connection = new HubConnectionBuilder()
  .withUrl('/hub/engine')
  .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => Math.min(1000 * 2 ** ctx.previousRetryCount, 8000) })
  .configureLogging(LogLevel.Warning)
  .build()

const { ingest, setConnection } = useEngine.getState()

connection.on('snapshot', (snapshot: Snapshot) => ingest(snapshot))
connection.onreconnecting(() => setConnection('reconnecting'))
connection.onreconnected(async () => {
  setConnection('online')
  ingest(await connection.invoke<Snapshot>('Sync'))
})
connection.onclose(() => {
  setConnection('offline')
  window.setTimeout(connect, 3000)
})

let starting: Promise<void> | null = null

export function connect(): Promise<void> {
  if (connection.state !== HubConnectionState.Disconnected) return starting ?? Promise.resolve()
  setConnection('connecting')
  starting = connection
    .start()
    .then(async () => {
      setConnection('online')
      ingest(await connection.invoke<Snapshot>('Sync'))
    })
    .catch(() => {
      setConnection('offline')
      window.setTimeout(connect, 3000)
    })
    .finally(() => {
      starting = null
    })
  return starting
}

/** SignalR wraps server errors as "...HubException: <message>"; keep only the message. */
function cleanError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  const marker = 'HubException: '
  const at = text.indexOf(marker)
  return at >= 0 ? text.slice(at + marker.length) : text
}

async function invoke<T>(method: string, ...args: unknown[]): Promise<T | undefined> {
  try {
    return await connection.invoke<T>(method, ...args)
  } catch (error) {
    useUi.getState().toast('error', `Could not ${method.toLowerCase()}`, cleanError(error))
    return undefined
  }
}

export const engine = {
  start: (settings: RunSettings) => invoke<string>('Start', settings),
  pause: () => invoke<boolean>('Pause'),
  resume: () => invoke<boolean>('Resume'),
  stop: () => invoke<boolean>('Stop'),
}
