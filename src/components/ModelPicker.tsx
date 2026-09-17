import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { Meter, ModelMark } from './primitives'
import { getState, setState, shallowEqualArray, updateSettings, useStore } from '../lib/store'
import { decideRoute, modelStatus } from '../lib/engine'
import { compact } from '../lib/format'
import { useClickOutside } from '../lib/hooks'
import type { Model, ModelId } from '../lib/types'

const STATUS_TEXT: Record<string, string> = {
  available: 'Available',
  limited: 'Low budget',
  exhausted: 'Limit reached',
  offline: 'Offline',
  disconnected: 'Not connected',
}

/** Compact trigger + popover used in the status bar and the chat header. */
export function ModelPicker({ variant = 'bar' }: { variant?: 'bar' | 'header' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  const models = useStore((s) => s.models, shallowEqualArray)
  const activeId = useStore((s) => s.activeModel)
  const mode = useStore((s) => s.settings.routerMode)
  const priority = useStore((s) => s.settings.priority, shallowEqualArray)

  const active = models.find((m) => m.id === activeId) ?? models[0]
  const status = modelStatus(active)
  const ratio = active.local ? 0 : active.tokens / active.tokensTotal

  const choose = (id: ModelId | 'auto') => {
    if (id === 'auto') {
      updateSettings({ routerMode: 'auto' })
      setState({ activeModel: decideRoute(getState(), true).model })
    } else {
      updateSettings({ routerMode: 'manual' })
      setState({ activeModel: id })
    }
    setOpen(false)
  }

  return (
    <div className="picker" data-variant={variant} ref={ref}>
      <button
        type="button"
        className="picker__trigger"
        data-model={active.id}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <ModelMark id={active.id} size={variant === 'header' ? 34 : 22} />
        <span className="picker__text">
          <span className="label">{mode === 'auto' ? 'Auto · Active model' : 'AI model'}</span>
          <span className="picker__name">
            {active.name} <em>{active.variant}</em>
          </span>
        </span>
        <span className="picker__state">
          <span className="dot" data-s={status} />
          <span className="label">{STATUS_TEXT[status]}</span>
        </span>
        <Icon name="chevronDown" size={13} className="picker__caret" />
      </button>

      {variant === 'header' ? (
        <div className="picker__budget">
          <span className="label">Token status</span>
          <div className="picker__budget-row">
            <span className="picker__budget-num num">
              {active.local ? 'Unmetered' : `${active.tokens.toLocaleString('en-US')} / ${active.tokensTotal.toLocaleString('en-US')}`}
            </span>
            {!active.local && <Meter value={1 - ratio} segments={18} />}
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="picker__pop panel" role="listbox">
          <button
            type="button"
            className="picker__opt picker__opt--auto"
            data-on={mode === 'auto' || undefined}
            onClick={() => choose('auto')}
            role="option"
            aria-selected={mode === 'auto'}
          >
            <span className="picker__auto-mark">
              <Icon name="branch" size={15} />
            </span>
            <span className="grow">
              <b>Auto</b>
              <em>Router picks by priority and budget</em>
            </span>
            <span className="picker__order mono">{priority.map((p) => p[0].toUpperCase()).join('›')}</span>
            {mode === 'auto' ? <Icon name="check" size={14} /> : null}
          </button>
          <hr className="hair" />
          {models.map((m) => (
            <ModelOption
              key={m.id}
              model={m}
              selected={mode === 'manual' && m.id === activeId}
              onSelect={() => choose(m.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ModelOption({
  model,
  selected,
  onSelect,
}: {
  model: Model
  selected: boolean
  onSelect: () => void
}) {
  const status = modelStatus(model)
  const dead = status === 'exhausted' || status === 'disconnected'
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className="picker__opt"
      data-model={model.id}
      data-on={selected || undefined}
      data-dead={dead || undefined}
      onClick={onSelect}
    >
      <ModelMark id={model.id} size={26} />
      <span className="grow">
        <b>{model.name}</b>
        <em>{model.variant}</em>
      </span>
      <span className="picker__opt-state">
        <span className="picker__opt-tokens num">
          {model.local ? '∞' : compact(model.tokens)}
        </span>
        <span className="row gap-6">
          <span className="dot" data-s={status} />
          <span className="label">{STATUS_TEXT[status]}</span>
        </span>
      </span>
      {selected ? <Icon name="check" size={14} /> : null}
    </button>
  )
}
