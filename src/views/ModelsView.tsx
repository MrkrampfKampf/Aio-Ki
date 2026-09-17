import { useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Counter, Meter, ModelMark, SectionLabel, Segmented, Sparkline } from '../components/primitives'
import { getState, setState, shallowEqualArray, updateSettings, useStore } from '../lib/store'
import { decideRoute, drainModel, modelStatus, partialBudget, refillModels, toggleConnection } from '../lib/engine'
import { MODEL_NAME } from '../lib/mockData'
import { compact, fmt } from '../lib/format'
import { navigate } from '../lib/router'
import type { Model, ModelId } from '../lib/types'

const STATUS_TEXT: Record<string, string> = {
  available: 'Available',
  limited: 'Low budget',
  exhausted: 'Limit reached',
  offline: 'Offline',
  disconnected: 'Not connected',
}

const SLOT = ['Primary', 'Fallback 1', 'Fallback 2', 'Fallback 3']

export function ModelsView() {
  const models = useStore((s) => s.models, shallowEqualArray)
  const mode = useStore((s) => s.settings.routerMode)
  const activeId = useStore((s) => s.activeModel)

  return (
    <div className="view models">
      <div className="models__grid">
        {models.map((m, i) => (
          <ModelPlate key={m.id} model={m} active={m.id === activeId} index={i} />
        ))}
      </div>

      <div className="models__split">
        <section className="router panel">
          <header className="router__head">
            <div>
              <span className="label">AI Router</span>
              <h3>Priority &amp; fallback</h3>
            </div>
            <Segmented
              value={mode}
              size="sm"
              onChange={(v) => updateSettings({ routerMode: v })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </header>
          <p className="router__note">
            In auto mode the router walks this list from the top and uses the first model that is
            connected and still above its reserve. Drag to reorder.
          </p>
          <PriorityList />
          <ReserveControl />
        </section>

        <section className="models__side">
          <RouteSimulation />
          <DemoPanel />
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- model plate */

const HISTORY: Record<ModelId, number[]> = {
  claude: [3, 5, 4, 7, 6, 9, 8, 12, 10, 14, 11, 13],
  gpt: [8, 6, 9, 7, 11, 9, 12, 10, 8, 13, 12, 15],
  gemini: [2, 3, 2, 5, 4, 3, 6, 5, 7, 4, 6, 5],
  local: [1, 0, 2, 1, 3, 2, 1, 4, 2, 3, 2, 4],
}

function ModelPlate({ model, active, index }: { model: Model; active: boolean; index: number }) {
  const status = modelStatus(model)
  const used = model.local ? 0 : 1 - model.tokens / model.tokensTotal
  const dead = status === 'exhausted' || status === 'disconnected'

  return (
    <article
      className="plate rise"
      data-model={model.id}
      data-active={active || undefined}
      data-dead={dead || undefined}
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="plate__sheen" aria-hidden="true" />
      <header className="plate__head">
        <ModelMark id={model.id} size={38} />
        <div className="plate__id">
          <span className="label">{model.vendor}</span>
          <h3>{model.name}</h3>
          <span className="plate__variant mono">{model.variant}</span>
        </div>
        <span className="plate__status">
          <span className="dot" data-s={status} />
          <span className="label">{STATUS_TEXT[status]}</span>
        </span>
      </header>

      <div className="plate__budget">
        <div className="plate__budget-top">
          <span className="plate__tokens num">
            {model.local ? 'Unmetered' : <Counter value={model.tokens} />}
          </span>
          {!model.local ? <span className="plate__total num">/ {fmt(model.tokensTotal)}</span> : null}
          <span className="grow" />
          <span className="label">{model.local ? 'On-device' : `${Math.round(used * 100)}% used`}</span>
        </div>
        <Meter value={model.local ? 1 : used} segments={28} tone={model.local ? 'model' : 'auto'} />
      </div>

      <dl className="plate__specs">
        <div>
          <dt className="label">Context</dt>
          <dd className="num">{compact(model.contextWindow)}</dd>
        </div>
        <div>
          <dt className="label">Latency</dt>
          <dd className="num">{model.latency} ms</dd>
        </div>
        <div>
          <dt className="label">Volume</dt>
          <dd>
            <Sparkline points={HISTORY[model.id]} width={60} height={16} />
          </dd>
        </div>
      </dl>

      <p className="plate__note">{model.note}</p>

      <div className="plate__tags">
        {model.strengths.map((s) => (
          <span key={s} className="chip">
            {s}
          </span>
        ))}
      </div>

      <footer className="plate__foot">
        <button
          type="button"
          className="btn btn--sm"
          disabled={dead}
          onClick={() => {
            updateSettings({ routerMode: 'manual' })
            setState({ activeModel: model.id })
            navigate('chat')
          }}
        >
          Use model
        </button>
        {!model.local ? (
          <button type="button" className="btn btn--sm" onClick={() => drainModel(model.id)}>
            Drain
          </button>
        ) : null}
        <span className="grow" />
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => toggleConnection(model.id)}
        >
          {model.connected ? 'Disconnect' : 'Connect'}
        </button>
      </footer>
    </article>
  )
}

/* ----------------------------------------------------------- priority list */

function PriorityList() {
  const priority = useStore((s) => s.settings.priority, shallowEqualArray)
  const models = useStore((s) => s.models, shallowEqualArray)
  const [dragging, setDragging] = useState<number | null>(null)
  const [offset, setOffset] = useState(0)
  const rowH = 58
  const start = useRef({ y: 0, index: 0 })

  const target = useMemo(() => {
    if (dragging === null) return null
    const shift = Math.round(offset / rowH)
    return Math.max(0, Math.min(priority.length - 1, dragging + shift))
  }, [dragging, offset, priority.length])

  const commit = () => {
    if (dragging !== null && target !== null && target !== dragging) {
      const next = [...priority]
      const [item] = next.splice(dragging, 1)
      next.splice(target, 0, item)
      updateSettings({ priority: next })
    }
    setDragging(null)
    setOffset(0)
  }

  const move = (from: number, dir: -1 | 1) => {
    const to = from + dir
    if (to < 0 || to >= priority.length) return
    const next = [...priority]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    updateSettings({ priority: next })
  }

  return (
    <ol
      className="prio"
      onPointerMove={(e) => {
        if (dragging === null) return
        setOffset(e.clientY - start.current.y)
      }}
      onPointerUp={commit}
      onPointerLeave={() => dragging !== null && commit()}
    >
      {priority.map((id, i) => {
        const m = models.find((x) => x.id === id)
        if (!m) return null
        const status = modelStatus(m)
        const isDragging = dragging === i
        let shift = 0
        if (dragging !== null && target !== null && !isDragging) {
          if (dragging < i && i <= target) shift = -rowH
          else if (dragging > i && i >= target) shift = rowH
        }
        return (
          <li
            key={id}
            className="prio__row"
            data-model={id}
            data-dragging={isDragging || undefined}
            style={{
              transform: isDragging ? `translateY(${offset}px)` : `translateY(${shift}px)`,
            }}
          >
            <button
              type="button"
              className="prio__grip"
              aria-label={`Reorder ${m.name}`}
              onPointerDown={(e) => {
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                start.current = { y: e.clientY, index: i }
                setDragging(i)
                setOffset(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  move(i, -1)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  move(i, 1)
                }
              }}
            >
              <Icon name="grip" size={15} />
            </button>
            <span className="prio__slot label">{SLOT[i] ?? `Fallback ${i}`}</span>
            <ModelMark id={id} size={26} />
            <span className="grow">
              <b>{m.name}</b>
              <em>{m.variant}</em>
            </span>
            <span className="prio__tokens num">{m.local ? '∞' : compact(m.tokens)}</span>
            <span className="dot" data-s={status} />
            <span className="prio__nudge">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                <Icon name="chevronDown" size={11} className="flip" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === priority.length - 1}
                aria-label="Move down"
              >
                <Icon name="chevronDown" size={11} />
              </button>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ReserveControl() {
  const reserve = useStore((s) => s.settings.fallbackThreshold)
  return (
    <div className="reserve">
      <div className="reserve__head">
        <span className="label">Fallback reserve</span>
        <span className="num">{fmt(reserve)} tokens</span>
      </div>
      <input
        type="range"
        min={0}
        max={2000}
        step={50}
        value={reserve}
        className="slider"
        style={{ '--fill': `${(reserve / 2000) * 100}%` } as React.CSSProperties}
        aria-label="Fallback reserve"
        onChange={(e) => updateSettings({ fallbackThreshold: Number(e.target.value) })}
      />
      <p className="reserve__note">
        A model is skipped once it drops below this figure, so a long answer is not started on a
        budget that cannot finish it.
      </p>
    </div>
  )
}

/* ------------------------------------------------------- route simulation */

function RouteSimulation() {
  const models = useStore((s) => s.models, shallowEqualArray)
  const priority = useStore((s) => s.settings.priority, shallowEqualArray)
  const mode = useStore((s) => s.settings.routerMode)
  const reserve = useStore((s) => s.settings.fallbackThreshold)
  const decision = useMemo(() => decideRoute(getState()), [models, priority, mode, reserve])

  return (
    <section className="panel simulate">
      <SectionLabel>Next message would use</SectionLabel>
      <div className="simulate__pick" data-model={decision.model}>
        <ModelMark id={decision.model} size={32} />
        <span className="grow">
          <b>{MODEL_NAME[decision.model]}</b>
          <em>{decision.reason}</em>
        </span>
        <Icon name="check" size={16} className="simulate__ok" />
      </div>
      {decision.skipped.length ? (
        <ul className="simulate__skipped">
          {decision.skipped.map((s) => (
            <li key={s.id}>
              <span className="simulate__pip" data-model={s.id} />
              <span className="grow">{MODEL_NAME[s.id]}</span>
              <span className="label">{s.why}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="simulate__clean label">No model skipped</p>
      )}
    </section>
  )
}

function DemoPanel() {
  const activeId = useStore((s) => s.activeModel)
  return (
    <section className="panel demo-panel">
      <SectionLabel>Simulation</SectionLabel>
      <p className="demo-panel__note">
        Everything here is mock data held in the browser. Use these to exercise the fallback without
        waiting for a budget to run down.
      </p>
      <div className="demo-panel__actions">
        <button type="button" className="btn btn--sm" onClick={() => drainModel(activeId)}>
          <Icon name="bolt" size={13} /> Simulate token exhaustion
        </button>
        <button type="button" className="btn btn--sm" onClick={() => partialBudget(activeId)}>
          <Icon name="activity" size={13} /> Run out mid-answer
        </button>
        <button type="button" className="btn btn--sm" onClick={refillModels}>
          <Icon name="refresh" size={13} /> Restore budgets
        </button>
        <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate('chat')}>
          <Icon name="chat" size={13} /> Open chat and test
        </button>
      </div>
    </section>
  )
}
