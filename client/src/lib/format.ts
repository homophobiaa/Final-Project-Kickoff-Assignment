const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function bytes(value: number, digits = 1): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1)
  const scaled = value / 1024 ** exponent
  return `${scaled.toFixed(exponent === 0 ? 0 : digits)} ${UNITS[exponent]}`
}

/** Run clock: 00:42.3 / 12:04.0 / 1:02:11 */
export function clock(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${String(Math.floor(seconds)).padStart(2, '0')}`
  return `${mm}:${seconds.toFixed(1).padStart(4, '0')}`
}

/** Short human duration: 840 ms / 3.2 s / 1 m 12 s */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  return `${minutes} m ${Math.round((ms % 60_000) / 1000)} s`
}

export const dims = (w: number, h: number) => (w && h ? `${w}×${h}` : '—')

export const int = (n: number) => Math.round(n).toLocaleString('en-US')

export function splitPath(relative: string): { dir: string; name: string } {
  const normalized = relative.replace(/\\/g, '/')
  const cut = normalized.lastIndexOf('/')
  return cut < 0 ? { dir: '', name: normalized } : { dir: normalized.slice(0, cut), name: normalized.slice(cut + 1) }
}

/** Shortens a path in the middle so both the drive and the folder name stay visible. */
export function middleEllipsis(text: string, max = 42): string {
  if (text.length <= max) return text
  const keep = max - 1
  const head = Math.ceil(keep * 0.4)
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`
}

export const pad = (n: number, width = 2) => String(n).padStart(width, '0')
