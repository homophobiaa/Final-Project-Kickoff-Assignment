import type { Defaults, FolderListing } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (body?.error) message = body.error
    } catch {
      // body was not JSON; keep the status text
    }
    throw new Error(message)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  defaults: () => request<Defaults>('/api/defaults'),
  listFolder: (path: string | null) => request<FolderListing>(`/api/fs?path=${encodeURIComponent(path ?? '')}`),
  generateSamples: (count: number) =>
    request<{ folder: string; files: number; elapsedMs: number }>('/api/samples', post({ count })),
  reveal: (path: string) => request<void>('/api/reveal', post({ path })),
}

/** `version` busts the browser cache between runs that overwrite the same output file. */
export const thumbUrl = (path: string, size: number, version: string) =>
  `/api/thumb?size=${size}&v=${encodeURIComponent(version)}&path=${encodeURIComponent(path)}`

export const imageUrl = (path: string, version: string) =>
  `/api/image?v=${encodeURIComponent(version)}&path=${encodeURIComponent(path)}`
