import type { ReactNode } from 'react'
import './SectionHeader.css'

interface Props {
  index: string
  title: string
  meta?: ReactNode
  actions?: ReactNode
}

export function SectionHeader({ index, title, meta, actions }: Props) {
  return (
    <header className="section-header">
      <span className="section-header__index mono">{index}</span>
      <h2 className="section-header__title display">{title}</h2>
      {meta && <span className="section-header__meta">{meta}</span>}
      <span className="section-header__rule" />
      {actions && <div className="section-header__actions">{actions}</div>}
    </header>
  )
}
