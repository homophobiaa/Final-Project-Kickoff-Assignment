import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { api } from '../../lib/api'
import { int } from '../../lib/format'
import type { FolderListing } from '../../lib/types'
import { useSettings } from '../../state/settings'
import { useUi } from '../../state/ui'
import { Icon } from '../common/Icon'
import './FolderBrowser.css'

/**
 * Browsers cannot hand a web page a real folder path, so the server lists the local file system
 * and this dialog navigates it.
 */
export function FolderBrowser() {
  const target = useUi((s) => s.browsing)
  return <AnimatePresence>{target && <Dialog key={target} target={target} />}</AnimatePresence>
}

function Dialog({ target }: { target: 'source' | 'output' }) {
  const browse = useUi((s) => s.browse)
  const update = useSettings((s) => s.update)
  const current = useSettings((s) => (target === 'source' ? s.sourceFolder : s.outputFolder))

  const [listing, setListing] = useState<FolderListing | null>(null)
  const [typed, setTyped] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const open = useCallback(async (path: string | null) => {
    setLoading(true)
    setError(null)
    setMissing(null)
    try {
      const next = await api.listFolder(path)
      setListing(next)
      setTyped(next.path ?? '')
    } catch (e) {
      setError((e as Error).message)
      if (path) setMissing(path)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // open the folder the field already points at; fall back to the places list
    api
      .listFolder(current || null)
      .then((l) => {
        setListing(l)
        setTyped(l.path ?? '')
      })
      .catch(() => open(null))
  }, [current, open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && browse(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [browse])

  const choose = (path: string) => {
    update(target === 'source' ? { sourceFolder: path } : { outputFolder: path })
    browse(null)
  }

  const crumbs = listing?.path ? breadcrumbs(listing.path) : []

  return (
    <motion.div className="browser" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => browse(null)}>
      <motion.div
        className="browser__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose ${target} folder`}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="browser__head">
          <div>
            <span className="label">{target === 'source' ? 'Source folder' : 'Output folder'}</span>
            <h2 className="display">{target === 'source' ? 'Where are the images?' : 'Where should they go?'}</h2>
          </div>
          <button className="btn btn--ghost btn--small" onClick={() => browse(null)} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>

        <form
          className="browser__path"
          onSubmit={(e) => {
            e.preventDefault()
            void open(typed.trim() || null)
          }}
        >
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Paste or type a path" spellCheck={false} autoFocus />
          <button className="btn btn--small" type="submit">
            Go
          </button>
        </form>

        <nav className="crumbs mono" aria-label="Path">
          <button onClick={() => open(null)} className={clsx(!listing?.path && 'is-current')}>
            This PC
          </button>
          {crumbs.map((c, i) => (
            <span key={c.path} className="crumbs__item">
              <Icon name="chevronRight" size={11} />
              <button onClick={() => open(c.path)} className={clsx(i === crumbs.length - 1 && 'is-current')}>
                {c.name}
              </button>
            </span>
          ))}
        </nav>

        <div className={clsx('browser__list', loading && 'is-loading')}>
          {error && (
            <div className="browser__error">
              <span>{error}</span>
              {missing && target === 'output' && (
                <button className="btn btn--small" onClick={() => choose(missing)}>
                  Use it anyway, it will be created
                </button>
              )}
            </div>
          )}
          {listing?.path && listing.parent !== undefined && (
            <button className="entry entry--up" onClick={() => open(listing.parent)}>
              <Icon name="up" size={15} />
              <span>..</span>
            </button>
          )}
          <AnimatePresence mode="popLayout" initial={false}>
            {listing?.entries.map((entry, i) => (
              <motion.button
                key={entry.path}
                className="entry"
                onClick={() => open(entry.path)}
                onDoubleClick={() => choose(entry.path)}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0, transition: { delay: Math.min(i, 20) * 0.012 } }}
                exit={{ opacity: 0 }}
              >
                <Icon name={entry.kind === 'drive' ? 'drive' : entry.kind === 'place' ? 'star' : 'folder'} size={15} />
                <span className="entry__name">{entry.name}</span>
                {entry.kind !== 'folder' && <span className="entry__path mono">{entry.path}</span>}
              </motion.button>
            ))}
          </AnimatePresence>
          {listing?.path && listing.entries.length === 0 && !error && <p className="browser__empty">No sub-folders here.</p>}
        </div>

        <footer className="browser__foot">
          <span className="mono browser__count">
            {listing?.path ? (
              <>
                <strong>{int(listing.imageCount)}</strong> image{listing.imageCount === 1 ? '' : 's'} directly in this folder
                {target === 'source' && ' · sub-folders are included'}
              </>
            ) : (
              'Pick a place or drive to start'
            )}
          </span>
          <button className="btn btn--ghost" onClick={() => browse(null)}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={!listing?.path} onClick={() => listing?.path && choose(listing.path)}>
            Use this folder
          </button>
        </footer>
      </motion.div>
    </motion.div>
  )
}

function breadcrumbs(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean)
  const sep = path.includes('\\') ? '\\' : '/'
  const absolute = path.startsWith('/')
  return parts.map((name, i) => {
    let p = parts.slice(0, i + 1).join(sep)
    if (i === 0 && /^[A-Za-z]:$/.test(p)) p += sep
    if (absolute) p = sep + p
    return { name, path: p }
  })
}
