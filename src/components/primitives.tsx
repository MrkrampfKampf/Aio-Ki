import type { ReactNode } from 'react'
import { useSpringNumber } from '../lib/hooks'
import { compact, fmt } from '../lib/format'
import type { ModelId } from '../lib/types'
import { Icon, type IconName } from './Icon'

/* ------------------------------------------------------------------ meter */

interface MeterProps {
  value: number
  segments?: number
  tone?: 'auto' | 'model' | 'accent' | 'crit'
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

/**
 * A segmented readout rather than a smooth progress bar — discrete ticks read
 * as an instrument and make small changes legible.
 */
export function Meter({ value, segments = 22, tone = 'auto', size = 'md', label }: MeterProps) {
  const v = useSpringNumber(Math.max(0, Math.min(1, value)), 0.2, 0.004)
  const lit = Math.round(v * segments)
  const state = value >= 0.999 ? 'crit' : value >= 0.9 ? 'warn' : 'ok'
  return (
    <div className="meter" data-size={size} data-tone={tone} data-state={state} role="presentation">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className="meter__seg" data-on={i < lit || undefined} style={{ '--n': i } as React.CSSProperties} />
      ))}
      {label ? <span className="sr">{label}</span> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- counter */

interface CounterProps {
  value: number
  compactAt?: number
  suffix?: string
  className?: string
}

export function Counter({ value, compactAt = Infinity, suffix, className }: CounterProps) {
  const v = useSpringNumber(value, 0.18, 0.5)
  const shown = value >= compactAt ? compact(v) : fmt(v)
  return (
    <span className={`num ${className ?? ''}`}>
      {shown}
      {suffix}
    </span>
  )
}

/* -------------------------------------------------------------- model mark */

const MARK: Record<ModelId, ReactNode> = {
  claude: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 4v16M5.1 8l13.8 8M18.9 8 5.1 16" />
    </svg>
  ),
  gpt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M12 3.6 19.4 8v8L12 20.4 4.6 16V8L12 3.6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  gemini: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M12 3.2c.6 4.6 4.2 8.2 8.8 8.8-4.6.6-8.2 4.2-8.8 8.8-.6-4.6-4.2-8.2-8.8-8.8 4.6-.6 8.2-4.2 8.8-8.8Z" />
    </svg>
  ),
  local: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <rect x="4.5" y="6.5" width="15" height="11" rx="2" />
      <path d="M9 21h6M12 17.5V21M8.5 10.5h7M8.5 13.5h4" />
    </svg>
  ),
}

export function ModelMark({ id, size = 26 }: { id: ModelId; size?: number }) {
  return (
    <span className="mark" data-model={id} style={{ '--s': `${size}px` } as React.CSSProperties}>
      {MARK[id]}
    </span>
  )
}

/* ---------------------------------------------------------------- controls */

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-on={on || undefined}
      onClick={() => onChange(!on)}
    >
      <span className="toggle__knob" />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: IconName }>
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="seg" data-size={size} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className="seg__item"
          data-on={value === o.value || undefined}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <Icon name={o.icon} size={13} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------- misc */

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="section-label">
      <span className="label">{children}</span>
      <span className="section-label__rule" />
      {right}
    </div>
  )
}

export function Sparkline({ points, width = 72, height = 20 }: { points: number[]; width?: number; height?: number }) {
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const span = max - min || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width
      const y = height - ((p - min) / span) * height
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
