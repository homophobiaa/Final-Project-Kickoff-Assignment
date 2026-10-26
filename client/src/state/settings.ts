import { create } from 'zustand'
import type { OutputFormat, RunSettings } from '../lib/types'

export const SIZE_PRESETS = [
  [320, 200],
  [640, 480],
  [800, 600],
  [1024, 768],
  [1200, 900],
  [1280, 800],
  [1600, 1200],
  [1920, 1200],
  [2048, 1536],
] as const

export type Preset = `${number}x${number}` | 'custom'

export interface SettingsState {
  sourceFolder: string
  outputFolder: string
  workerCount: number
  preset: Preset
  width: number
  height: number
  keepAspectRatio: boolean
  allowUpscale: boolean
  format: OutputFormat
  quality: number
  simulatedLatencyMs: number
}

interface SettingsStore extends SettingsState {
  update: (patch: Partial<SettingsState>) => void
  choosePreset: (preset: Preset) => void
}

const STORAGE_KEY = 'safelight.settings.v1'

const defaults: SettingsState = {
  sourceFolder: '',
  outputFolder: '',
  workerCount: 4,
  preset: '800x600',
  width: 800,
  height: 600,
  keepAspectRatio: true,
  allowUpscale: false,
  format: 'Original',
  quality: 85,
  simulatedLatencyMs: 600,
}

function load(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

function save(state: SettingsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable (private window); settings just won't persist
  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),

  update: (patch) => {
    set(patch)
    save(pick(get()))
  },

  choosePreset: (preset) => {
    if (preset === 'custom') {
      get().update({ preset })
      return
    }
    const [width, height] = preset.split('x').map(Number)
    get().update({ preset, width, height, keepAspectRatio: true })
  },
}))

export const hasStoredSettings = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

function pick(store: SettingsStore): SettingsState {
  const { update: _u, choosePreset: _c, ...state } = store
  return state
}

export function toRunSettings(s: SettingsState): RunSettings {
  return {
    sourceFolder: s.sourceFolder,
    outputFolder: s.outputFolder,
    workerCount: s.workerCount,
    simulatedLatencyMs: s.simulatedLatencyMs,
    resize: {
      width: s.width,
      height: s.height,
      keepAspectRatio: s.keepAspectRatio,
      allowUpscale: s.allowUpscale,
      format: s.format,
      quality: s.quality,
    },
  }
}
