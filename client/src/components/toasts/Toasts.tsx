import { AnimatePresence, motion } from 'motion/react'
import clsx from 'clsx'
import { useUi } from '../../state/ui'
import { Icon } from '../common/Icon'
import './Toasts.css'

export function Toasts() {
  const toasts = useUi((s) => s.toasts)
  const dismiss = useUi((s) => s.dismiss)

  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={clsx('toast', `toast--${t.tone}`)}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <span className="toast__mark" />
            <div className="toast__text">
              <strong>{t.title}</strong>
              {t.body && <span>{t.body}</span>}
            </div>
            <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <Icon name="close" size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
