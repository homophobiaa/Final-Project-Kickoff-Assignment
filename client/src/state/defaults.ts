import { create } from 'zustand'
import { api } from '../lib/api'
import type { Defaults } from '../lib/types'
import { hasStoredSettings, useSettings } from './settings'

export const useDefaults = create<{ defaults: Defaults | null }>(() => ({ defaults: null }))

/** Fetches machine-specific defaults and seeds a first-time user's settings from them. */
export async function loadDefaults() {
  try {
    const defaults = await api.defaults()
    useDefaults.setState({ defaults })

    const settings = useSettings.getState()
    if (!hasStoredSettings()) {
      settings.update({
        workerCount: Math.min(8, Math.max(2, Math.floor(defaults.processorCount / 2))),
        outputFolder: defaults.outputFolder,
        sourceFolder: defaults.sampleRollReady ? defaults.sampleFolder : '',
      })
    } else if (!settings.outputFolder) {
      settings.update({ outputFolder: defaults.outputFolder })
    }
  } catch {
    // engine offline; the connection banner already says so and we retry on reconnect
  }
}
