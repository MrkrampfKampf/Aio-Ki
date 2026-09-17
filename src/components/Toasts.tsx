import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ModelMark } from './primitives'
import { useBus, useStore } from '../lib/store'
import type { ModelId } from '../lib/types'

interface Toast {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'crit'
  model?: ModelId
  kind?: 'handoff' | 'memory'
  to?: ModelId
}

let seq = 0

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([])
  const timers = useRef<number[]>([])
  const notifyHandoff = useStore((s) => s.settings.notifyHandoff)
  const notifyMemory = useStore((s) => s.settings.notifyMemory)

  const push = (t: Omit<Toast, 'id'>) => {
    const id = ++seq
    setItems((list) => [...list.slice(-2), { ...t, id }])
    timers.current.push(
      window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), 3600),
    )
  }

  useBus((e) => {
    if (e.type === 'toast') push({ text: e.text, tone: e.tone })
    if (e.type === 'handoff' && notifyHandoff)
      push({ text: 'Router switched model', kind: 'handoff', model: e.from as ModelId, to: e.to as ModelId })
    if (e.type === 'memory' && notifyMemory)
      push({ text: e.title, kind: 'memory', tone: 'ok' })
  })

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone}>
          {t.kind === 'handoff' && t.model && t.to ? (
            <>
              <ModelMark id={t.model} size={20} />
              <Icon name="arrow" size={13} className="dim" />
              <ModelMark id={t.to} size={20} />
              <span>{t.text}</span>
            </>
          ) : t.kind === 'memory' ? (
            <>
              <span className="toast__badge" data-tone="ok">
                <Icon name="memory" size={13} />
              </span>
              <span>
                <span className="label">Memory captured</span>
                <br />
                {t.text}
              </span>
            </>
          ) : (
            <>
              <span className="toast__badge" data-tone={t.tone}>
                <Icon name={t.tone === 'warn' ? 'bolt' : t.tone === 'crit' ? 'close' : 'check'} size={13} />
              </span>
              <span>{t.text}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
