import { useEffect, useRef } from 'react'
import { MotionConfig } from 'motion/react'
import { duration, int } from './lib/format'
import { connect } from './lib/hub'
import { loadDefaults } from './state/defaults'
import { useEngine } from './state/engine'
import { useUi } from './state/ui'
import { FolderBrowser } from './components/browser/FolderBrowser'
import { Header } from './components/header/Header'
import { runCommand } from './components/header/controls'
import { QueuePanel } from './components/queue/QueuePanel'
import { ResultsPanel } from './components/results/ResultsPanel'
import { SetupPanel } from './components/setup/SetupPanel'
import { StatsStrip } from './components/stats/StatsStrip'
import { TimelinePanel } from './components/timeline/TimelinePanel'
import { Toasts } from './components/toasts/Toasts'
import { Viewer } from './components/viewer/Viewer'
import { WorkersPanel } from './components/workers/WorkersPanel'
import './App.css'

export default function App() {
  useEngineLifecycle()
  useShortcuts()

  return (
    <MotionConfig reducedMotion="user">
      <div className="safelight-glow" aria-hidden="true" />
      <div className="app">
        <Header />
        <SetupPanel />
        <main className="main">
          <StatsStrip />
          <WorkersPanel />
          <TimelinePanel />
          <ResultsPanel />
        </main>
        <QueuePanel />
      </div>
      <Viewer />
      <FolderBrowser />
      <Toasts />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </MotionConfig>
  )
}

/** Connects to the engine, mirrors its status onto <html> for the lighting, and announces finished runs. */
function useEngineLifecycle() {
  const status = useEngine((s) => s.snapshot?.status)
  const connection = useEngine((s) => s.connection)
  const previous = useRef(status)

  useEffect(() => {
    void connect()
  }, [])

  useEffect(() => {
    if (connection === 'online') void loadDefaults()
  }, [connection])

  useEffect(() => {
    document.documentElement.dataset.status = status ?? 'Idle'

    const was = previous.current
    previous.current = status
    if (!was || was === status) return

    const { snapshot } = useEngine.getState()
    const toast = useUi.getState().toast
    if (!snapshot) return
    const { succeeded, failed, cancelled } = snapshot.stats

    if (status === 'Completed') {
      toast('success', `Developed ${int(succeeded)} image${succeeded === 1 ? '' : 's'} in ${duration(snapshot.elapsedMs)}`, failed ? `${failed} could not be read. See the Failed filter.` : undefined)
    } else if (status === 'Stopped') {
      toast('info', 'Run stopped', `${int(succeeded)} developed, ${int(cancelled)} cancelled.`)
    }
    if (snapshot.scanError) toast('error', 'Folder scan problem', snapshot.scanError)
  }, [status])
}

/** S / P / R / X for the four commands, Space toggles pause. Ignored while typing or in a dialog. */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable]')) return
      const { browsing, viewing } = useUi.getState()
      if (browsing || viewing !== null) return

      const key = e.key.toLowerCase()
      if (key === 's') runCommand('start')
      else if (key === 'p') runCommand('pause')
      else if (key === 'r') runCommand('resume')
      else if (key === 'x') runCommand('stop')
      else if (key === ' ' && !target.closest('button')) {
        e.preventDefault()
        runCommand(useEngine.getState().snapshot?.status === 'Paused' ? 'resume' : 'pause')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
