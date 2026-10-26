import { create } from 'zustand'

export type ToastTone = 'info' | 'error' | 'success'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: string
}

export type ResultFilter = 'all' | 'developed' | 'failed'

interface UiStore {
  toasts: Toast[]
  browsing: 'source' | 'output' | null
  viewing: number | null
  resultFilter: ResultFilter
  resultQuery: string
  resultView: 'sheet' | 'ledger'
  toast: (tone: ToastTone, title: string, body?: string) => void
  dismiss: (id: number) => void
  browse: (target: 'source' | 'output' | null) => void
  view: (jobId: number | null) => void
  set: (patch: Partial<Pick<UiStore, 'resultFilter' | 'resultQuery' | 'resultView'>>) => void
}

let nextToast = 1

export const useUi = create<UiStore>((set, get) => ({
  toasts: [],
  browsing: null,
  viewing: null,
  resultFilter: 'all',
  resultQuery: '',
  resultView: 'sheet',

  toast: (tone, title, body) => {
    const id = nextToast++
    set({ toasts: [...get().toasts.slice(-3), { id, tone, title, body }] })
    window.setTimeout(() => get().dismiss(id), tone === 'error' ? 7000 : 4500)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  browse: (browsing) => set({ browsing }),
  view: (viewing) => set({ viewing }),
  set: (patch) => set(patch),
}))
