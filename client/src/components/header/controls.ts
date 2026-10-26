import { engine } from '../../lib/hub'
import { isActive } from '../../lib/types'
import { useEngine } from '../../state/engine'
import { toRunSettings, useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'

/** Which of the four commands make sense right now. */
export function availableCommands(status: string | undefined, online: boolean) {
  return {
    start: online && !isActive(status as never),
    pause: online && status === 'Running',
    resume: online && status === 'Paused',
    stop: online && (status === 'Running' || status === 'Paused'),
  }
}

export async function startRun() {
  const settings = useSettings.getState()
  const { toast, set } = useUi.getState()
  if (!settings.sourceFolder) return toast('error', 'No source folder', 'Choose the folder with the images to resize.')
  if (!settings.outputFolder) return toast('error', 'No output folder', 'Choose where the resized images should go.')

  set({ resultFilter: 'all', resultQuery: '' })
  await engine.start(toRunSettings(settings))
}

export function runCommand(command: 'start' | 'pause' | 'resume' | 'stop') {
  const { snapshot, connection } = useEngine.getState()
  const allowed = availableCommands(snapshot?.status, connection === 'online')
  if (!allowed[command]) return
  if (command === 'start') void startRun()
  else void engine[command]()
}
