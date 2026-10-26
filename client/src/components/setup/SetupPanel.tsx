import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import clsx from 'clsx'
import { api } from '../../lib/api'
import { fit } from '../../lib/fit'
import { middleEllipsis } from '../../lib/format'
import { isActive, type OutputFormat } from '../../lib/types'
import { useDefaults } from '../../state/defaults'
import { useEngine } from '../../state/engine'
import { SIZE_PRESETS, useSettings, type Preset } from '../../state/settings'
import { useUi } from '../../state/ui'
import { Icon } from '../common/Icon'
import { SectionHeader } from '../common/SectionHeader'
import './SetupPanel.css'

const FORMATS: { value: OutputFormat; label: string }[] = [
  { value: 'Original', label: 'Keep' },
  { value: 'Jpeg', label: 'JPEG' },
  { value: 'Png', label: 'PNG' },
  { value: 'Webp', label: 'WebP' },
]

export function SetupPanel() {
  const locked = useEngine((s) => isActive(s.snapshot?.status))

  return (
    <aside className="setup" aria-label="Run setup">
      <SectionHeader index="01" title="Setup" meta={locked ? 'Locked while running' : undefined} />
      <fieldset className="setup__fieldset" disabled={locked}>
        <Folders />
        <SizeSection />
        <OutputSection />
        <WorkersSection />
        <LatencySection />
      </fieldset>
    </aside>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="group">
      <div className="group__head">
        <h3 className="label">{title}</h3>
        {hint && <span className="group__hint mono">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/* ---------------- folders ---------------- */

function Folders() {
  const source = useSettings((s) => s.sourceFolder)
  const output = useSettings((s) => s.outputFolder)
  const browse = useUi((s) => s.browse)

  return (
    <Group title="Folders">
      <FolderField label="Source" path={source} onBrowse={() => browse('source')} />
      <FolderField label="Output" path={output} onBrowse={() => browse('output')} />
      <SampleRoll />
    </Group>
  )
}

function FolderField({ label, path, onBrowse }: { label: string; path: string; onBrowse: () => void }) {
  return (
    <button type="button" className={clsx('folder-field', !path && 'is-empty')} onClick={onBrowse}>
      <span className="folder-field__label mono">{label}</span>
      <span className="folder-field__path mono" title={path}>
        {path ? middleEllipsis(path, 38) : 'Choose a folder…'}
      </span>
      <Icon name="folder" size={15} className="folder-field__icon" />
    </button>
  )
}

function SampleRoll() {
  const [busy, setBusy] = useState(false)
  const toast = useUi((s) => s.toast)
  const update = useSettings((s) => s.update)

  const generate = async () => {
    setBusy(true)
    try {
      const result = await api.generateSamples(48)
      const defaults = useDefaults.getState().defaults
      update({
        sourceFolder: result.folder,
        ...(defaults && !useSettings.getState().outputFolder ? { outputFolder: defaults.outputFolder } : {}),
      })
      toast('success', 'Sample roll ready', `${result.files} large images painted in ${(result.elapsedMs / 1000).toFixed(1)} s.`)
    } catch (error) {
      toast('error', 'Could not paint the sample roll', (error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={clsx('sample-roll', busy && 'is-busy')}>
      <div className="sample-roll__copy">
        <strong>No photos handy?</strong>
        <span>Paint 48 large landscapes (up to 6000 px), nested folders, mixed formats, one damaged file.</span>
      </div>
      <button type="button" className="btn btn--small" onClick={generate} disabled={busy}>
        <Icon name="roll" size={14} className={busy ? 'spin' : undefined} />
        {busy ? 'Painting…' : 'Sample roll'}
      </button>
      {busy && <span className="sample-roll__progress" />}
    </div>
  )
}

/* ---------------- size ---------------- */

function SizeSection() {
  const s = useSettings()

  return (
    <Group title="Target size" hint={`${s.width} × ${s.height}`}>
      <div className="presets" role="radiogroup" aria-label="Size preset">
        {SIZE_PRESETS.map(([w, h]) => {
          const id = `${w}x${h}` as Preset
          return (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={s.preset === id}
              className={clsx('preset mono', s.preset === id && 'is-active')}
              onClick={() => s.choosePreset(id)}
            >
              {w}×{h}
              {s.preset === id && <motion.span layoutId="preset-marker" className="preset__marker" />}
            </button>
          )
        })}
        <button
          type="button"
          role="radio"
          aria-checked={s.preset === 'custom'}
          className={clsx('preset preset--custom', s.preset === 'custom' && 'is-active')}
          onClick={() => s.choosePreset('custom')}
        >
          Custom
          {s.preset === 'custom' && <motion.span layoutId="preset-marker" className="preset__marker" />}
        </button>
      </div>

      <motion.div
        className="custom-size"
        initial={false}
        animate={{ height: s.preset === 'custom' ? 'auto' : 0, opacity: s.preset === 'custom' ? 1 : 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="custom-size__inner">
          <label className="field">
            <span className="label">Width</span>
            <NumberInput value={s.width} onChange={(width) => s.update({ width })} />
          </label>
          <span className="custom-size__x mono">×</span>
          <label className="field">
            <span className="label">Height</span>
            <NumberInput value={s.height} onChange={(height) => s.update({ height })} />
          </label>
        </div>
      </motion.div>

      <Toggle
        checked={s.keepAspectRatio}
        onChange={(keepAspectRatio) => s.update({ keepAspectRatio })}
        label="Maintain aspect ratio"
        note="Fit inside the target instead of stretching"
      />
      <Toggle
        checked={s.allowUpscale}
        onChange={(allowUpscale) => s.update({ allowUpscale })}
        label="Allow upscaling"
        note="Enlarge images smaller than the target"
        disabled={!s.keepAspectRatio}
      />

      <FitDiagram />
    </Group>
  )
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="input num"
      inputMode="numeric"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 5))}
      onBlur={() => {
        const n = Number(draft)
        if (draft !== null && n >= 1 && n <= 20000) onChange(n)
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** Live explanation of proportional sizing, using the example from the assignment. */
function FitDiagram() {
  const { width, height, keepAspectRatio, allowUpscale } = useSettings()
  const samples: [number, number][] = [
    [3265, 4898],
    [6000, 4000],
  ]
  const box = { w: 118, h: 78 }
  const scale = Math.min(box.w / width, box.h / height)
  const frame = { w: width * scale, h: height * scale }
  const spring = { type: 'spring', stiffness: 220, damping: 26 } as const

  return (
    <div className="fit-diagram">
      {samples.map(([sw, sh]) => {
        const [ow, oh] = fit(sw, sh, width, height, keepAspectRatio, allowUpscale)
        const out = { w: ow * scale, h: oh * scale }
        return (
          <figure key={`${sw}x${sh}`} className="fit-diagram__case">
            <svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
              <motion.rect
                className="fit-diagram__frame"
                initial={false}
                animate={{ x: (box.w - frame.w) / 2, y: (box.h - frame.h) / 2, width: frame.w, height: frame.h }}
                transition={spring}
              />
              <motion.rect
                className="fit-diagram__image"
                initial={false}
                animate={{
                  x: (box.w - Math.min(out.w, box.w)) / 2,
                  y: (box.h - Math.min(out.h, box.h)) / 2,
                  width: Math.min(out.w, box.w),
                  height: Math.min(out.h, box.h),
                }}
                transition={spring}
              />
            </svg>
            <figcaption className="mono num">
              <span>
                {sw}×{sh}
              </span>
              <span className="fit-diagram__arrow">→</span>
              <strong>
                {ow}×{oh}
              </strong>
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
}

/* ---------------- output ---------------- */

function OutputSection() {
  const format = useSettings((s) => s.format)
  const quality = useSettings((s) => s.quality)
  const update = useSettings((s) => s.update)
  const lossless = format === 'Png'

  return (
    <Group title="Output format" hint={lossless ? 'lossless' : `quality ${quality}`}>
      <div className="segmented" role="radiogroup" aria-label="Output format">
        {FORMATS.map((f) => (
          <button
            type="button"
            key={f.value}
            role="radio"
            aria-checked={format === f.value}
            className={clsx('segmented__option', format === f.value && 'is-active')}
            onClick={() => update({ format: f.value })}
          >
            {format === f.value && <motion.span layoutId="format-pill" className="segmented__pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
            <span>{f.label}</span>
          </button>
        ))}
      </div>
      <Range min={40} max={100} value={quality} onChange={(q) => update({ quality: q })} disabled={lossless} label="Quality" />
    </Group>
  )
}

/* ---------------- workers ---------------- */

function WorkersSection() {
  const workerCount = useSettings((s) => s.workerCount)
  const update = useSettings((s) => s.update)
  const cores = useDefaults((s) => s.defaults?.processorCount ?? 8)
  const max = 32

  return (
    <Group title="Parallel workers" hint={`${cores} logical cores`}>
      <div className="workers-control">
        <button type="button" className="stepper" onClick={() => update({ workerCount: Math.max(1, workerCount - 1) })} aria-label="Fewer workers">
          −
        </button>
        <div className="workers-control__value">
          <motion.span
            key={workerCount}
            className="display"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {workerCount}
          </motion.span>
          <span className="label">threads</span>
        </div>
        <button type="button" className="stepper" onClick={() => update({ workerCount: Math.min(max, workerCount + 1) })} aria-label="More workers">
          +
        </button>
      </div>
      <div className="thread-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => (
          <button
            type="button"
            tabIndex={-1}
            key={i}
            className={clsx('thread-pip', i < workerCount && 'is-on', i >= cores && 'is-oversubscribed')}
            onClick={() => update({ workerCount: i + 1 })}
            style={{ transitionDelay: `${Math.abs(i - workerCount) * 8}ms` }}
          />
        ))}
      </div>
      {workerCount > cores && <p className="note">More workers than cores: they will share CPU time.</p>}
    </Group>
  )
}

function LatencySection() {
  const latency = useSettings((s) => s.simulatedLatencyMs)
  const update = useSettings((s) => s.update)

  return (
    <Group title="Simulated latency" hint={latency ? `+${latency} ms / image` : 'off'}>
      <Range min={0} max={3000} step={100} value={latency} onChange={(v) => update({ simulatedLatencyMs: v })} label="Latency" />
      <p className="note">Slows every job down so you can watch the workers interleave. Set to 0 for full speed.</p>
    </Group>
  )
}

/* ---------------- primitives ---------------- */

function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string; note?: string; disabled?: boolean }) {
  return (
    <label className={clsx('toggle', props.disabled && 'is-disabled')}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__text">
        <span>{props.label}</span>
        {props.note && <small>{props.note}</small>}
      </span>
    </label>
  )
}

function Range(props: { min: number; max: number; step?: number; value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100
  return (
    <input
      type="range"
      className="range"
      aria-label={props.label}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(Number(e.target.value))}
      style={{ ['--fill' as string]: `${fill}%` }}
    />
  )
}
