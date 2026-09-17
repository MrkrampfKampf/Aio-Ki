import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from '../components/Icon'
import { ModelMark, Segmented, Toggle } from '../components/primitives'
import {
  emit,
  getState,
  resetAll,
  shallowEqualArray,
  updateSettings,
  useStore,
} from '../lib/store'
import { syncMemory, toggleConnection } from '../lib/engine'
import { MODEL_NAME } from '../lib/mockData'
import { fmt } from '../lib/format'
import { navigate } from '../lib/router'
import type { AccentName, Model, ThemeMode } from '../lib/types'

const SECTIONS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'models', label: 'Models', icon: 'models' },
  { id: 'connections', label: 'API connections', icon: 'link' },
  { id: 'routing', label: 'Routing', icon: 'branch' },
  { id: 'memory', label: 'Memory', icon: 'memory' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'privacy', label: 'Privacy', icon: 'shield' },
  { id: 'data', label: 'Data', icon: 'database' },
]

/** Providers that exist in the UI but are not wired up in the demo. */
const EXTRA_PROVIDERS = [
  { id: 'mistral', name: 'Mistral', vendor: 'Mistral AI', variant: 'Large 2' },
  { id: 'grok', name: 'Grok', vendor: 'xAI', variant: 'Grok 4' },
]

export function SettingsView({ section }: { section?: string }) {
  const current = SECTIONS.some((s) => s.id === section) ? section! : 'models'
  const [configure, setConfigure] = useState<string | null>(null)

  return (
    <div className="view settings">
      <nav className="settings__nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="settings__nav-item"
            data-on={current === s.id || undefined}
            onClick={() => navigate('settings', s.id)}
          >
            <Icon name={s.icon} size={15} />
            {s.label}
          </button>
        ))}
      </nav>

      <div className="settings__body">
        {current === 'models' && <ModelsSection />}
        {current === 'connections' && <ConnectionsSection onConfigure={setConfigure} />}
        {current === 'routing' && <RoutingSection />}
        {current === 'memory' && <MemorySection />}
        {current === 'appearance' && <AppearanceSection />}
        {current === 'notifications' && <NotificationsSection />}
        {current === 'privacy' && <PrivacySection />}
        {current === 'data' && <DataSection />}
      </div>

      {configure ? <ConfigureDialog id={configure} onClose={() => setConfigure(null)} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="sgroup">
      <header>
        <h3>{title}</h3>
        {note ? <p>{note}</p> : null}
      </header>
      <div className="sgroup__body panel panel--flat">{children}</div>
    </section>
  )
}

function Row({
  title,
  note,
  children,
}: {
  title: React.ReactNode
  note?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="srow">
      <div className="srow__text">
        <b>{title}</b>
        {note ? <em>{note}</em> : null}
      </div>
      <div className="srow__control">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ models */

function ModelsSection() {
  const models = useStore((s) => s.models, shallowEqualArray)
  const priority = useStore((s) => s.settings.priority, shallowEqualArray)

  return (
    <Group title="Models" note="Which models are part of the pool and how they are labelled.">
      {models.map((m) => (
        <Row
          key={m.id}
          title={
            <span className="row gap-8">
              <ModelMark id={m.id} size={22} />
              {m.name} <span className="dim">{m.variant}</span>
            </span>
          }
          note={`${m.vendor} · ${fmt(m.contextWindow)} context · priority ${priority.indexOf(m.id) + 1}`}
        >
          <Toggle
            on={m.connected}
            label={`Enable ${m.name}`}
            onChange={() => toggleConnection(m.id)}
          />
        </Row>
      ))}
    </Group>
  )
}

/* ------------------------------------------------------------- connections */

function ConnectionsSection({ onConfigure }: { onConfigure: (id: string) => void }) {
  const models = useStore((s) => s.models, shallowEqualArray)

  return (
    <>
      <div className="notice">
        <Icon name="flask" size={14} />
        <span>
          Connections are simulated. No keys are stored, no requests are made, and nothing in this
          build reaches a provider.
        </span>
      </div>

      <Group title="Connected" note="Providers currently part of the routing pool.">
        {models.map((m: Model) => (
          <Row
            key={m.id}
            title={
              <span className="row gap-8">
                <ModelMark id={m.id} size={22} />
                {m.name}
              </span>
            }
            note={
              m.local
                ? 'localhost:11434 · on-device runtime'
                : `api.${m.vendor.toLowerCase().replace(/\s+/g, '')}.com · key ••••${m.id.slice(0, 4)}`
            }
          >
            <span className="row gap-8">
              <span className="chip">
                <span className="dot" data-s={m.connected ? 'connected' : 'offline'} />
                {m.connected ? 'Connected' : 'Disabled'}
              </span>
              <button type="button" className="btn btn--sm" onClick={() => onConfigure(m.id)}>
                Configure
              </button>
            </span>
          </Row>
        ))}
      </Group>

      <Group title="Available" note="Providers the interface supports but that are not set up.">
        {EXTRA_PROVIDERS.map((p) => (
          <Row key={p.id} title={p.name} note={`${p.vendor} · ${p.variant}`}>
            <span className="row gap-8">
              <span className="chip">
                <span className="dot" data-s="offline" />
                Not connected
              </span>
              <button type="button" className="btn btn--sm" onClick={() => onConfigure(p.id)}>
                Configure
              </button>
            </span>
          </Row>
        ))}
      </Group>
    </>
  )
}

function ConfigureDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const model = getState().models.find((m) => m.id === id)
  const extra = EXTRA_PROVIDERS.find((p) => p.id === id)
  const name = model?.name ?? extra?.name ?? id
  const [state, setState_] = useState<'idle' | 'testing' | 'ok'>('idle')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Configure ${name}`}>
      <div className="modal__scrim" onClick={onClose} />
      <div className="modal__panel panel">
        <header className="modal__head">
          {model ? <ModelMark id={model.id} size={30} /> : <span className="cmdk__icon"><Icon name="link" size={14} /></span>}
          <div className="grow">
            <span className="label">Configure connection</span>
            <h3>{name}</h3>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="modal__body">
          <label className="field">
            <span className="label">API key</span>
            <input
              type="password"
              value="demo-key-not-used"
              readOnly
              aria-describedby="key-note"
              onFocus={(e) => e.currentTarget.select()}
            />
            <span id="key-note" className="field__note">
              Placeholder only. This build never reads or sends a key.
            </span>
          </label>

          <label className="field">
            <span className="label">Endpoint</span>
            <input
              readOnly
              value={
                model?.local
                  ? 'http://localhost:11434/v1'
                  : `https://api.${(model?.vendor ?? extra?.vendor ?? name).toLowerCase().replace(/\s+/g, '')}.com/v1`
              }
            />
          </label>

          <label className="field">
            <span className="label">Default variant</span>
            <input readOnly value={model?.variant ?? extra?.variant ?? '—'} />
          </label>
        </div>

        <footer className="modal__foot">
          <button
            type="button"
            className="btn"
            disabled={state === 'testing'}
            onClick={() => {
              setState_('testing')
              window.setTimeout(() => setState_('ok'), 1200)
            }}
          >
            {state === 'testing' ? (
              <>
                <Icon name="refresh" size={13} className="spin" /> Testing
              </>
            ) : state === 'ok' ? (
              <>
                <Icon name="check" size={13} /> Reachable (simulated)
              </>
            ) : (
              'Test connection'
            )}
          </button>
          <span className="grow" />
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/* ----------------------------------------------------------------- routing */

function RoutingSection() {
  const s = useStore((st) => st.settings)
  return (
    <Group title="Routing" note="How the router decides which model answers the next message.">
      <Row title="Mode" note="Auto walks the priority list; manual pins one model.">
        <Segmented
          value={s.routerMode}
          size="sm"
          onChange={(v) => updateSettings({ routerMode: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'manual', label: 'Manual' },
          ]}
        />
      </Row>
      <Row title="Priority order" note={s.priority.map((p) => MODEL_NAME[p]).join(' → ')}>
        <button type="button" className="btn btn--sm" onClick={() => navigate('models')}>
          Edit order
        </button>
      </Row>
      <Row title="Fallback reserve" note="A model is skipped once it falls below this budget.">
        <span className="row gap-12">
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={s.fallbackThreshold}
            className="slider"
            style={{ width: 150, '--fill': `${(s.fallbackThreshold / 2000) * 100}%` } as React.CSSProperties}
            aria-label="Fallback reserve"
            onChange={(e) => updateSettings({ fallbackThreshold: Number(e.target.value) })}
          />
          <span className="num">{fmt(s.fallbackThreshold)}</span>
        </span>
      </Row>
      <Row title="Stream responses" note="Type answers out token by token instead of all at once.">
        <Toggle on={s.streamResponses} label="Stream responses" onChange={(v) => updateSettings({ streamResponses: v })} />
      </Row>
      <Row title="Local only" note="Route everything to the on-device model, whatever the priority list says.">
        <Toggle on={s.localOnly} label="Local only" onChange={(v) => updateSettings({ localOnly: v })} />
      </Row>
    </Group>
  )
}

/* ------------------------------------------------------------------ memory */

function MemorySection() {
  const s = useStore((st) => st.settings)
  const memories = useStore((st) => st.memories)
  const live = memories.filter((m) => !m.forgotten)

  return (
    <>
      <Group title="Shared memory" note="What is captured and which models can read it.">
        <Row title="Automatic capture" note="Extract facts and preferences from conversations.">
          <Toggle on={s.memoryCapture} label="Automatic capture" onChange={(v) => updateSettings({ memoryCapture: v })} />
        </Row>
        <Row title="Share across models" note="Inject relevant memories into every model's context.">
          <Toggle on={s.memorySharing} label="Share across models" onChange={(v) => updateSettings({ memorySharing: v })} />
        </Row>
        <Row title="Retention" note="How long an unused memory is kept.">
          <Segmented
            value={s.memoryRetention}
            size="sm"
            onChange={(v) => updateSettings({ memoryRetention: v })}
            options={[
              { value: '30d', label: '30 days' },
              { value: '180d', label: '180 days' },
              { value: 'forever', label: 'Forever' },
            ]}
          />
        </Row>
        <Row title="Index" note={`${live.length} live · ${memories.length - live.length} forgotten`}>
          <span className="row gap-8">
            <button type="button" className="btn btn--sm" onClick={() => void syncMemory()}>
              <Icon name="refresh" size={13} /> Synchronise
            </button>
            <button type="button" className="btn btn--sm" onClick={() => navigate('memory')}>
              Browse
            </button>
          </span>
        </Row>
      </Group>
    </>
  )
}

/* -------------------------------------------------------------- appearance */

const ACCENTS: Array<{ id: AccentName; label: string }> = [
  { id: 'amber', label: 'Amber' },
  { id: 'ice', label: 'Ice' },
  { id: 'lime', label: 'Lime' },
  { id: 'signal', label: 'Signal' },
]

function AppearanceSection() {
  const s = useStore((st) => st.settings)
  return (
    <Group title="Appearance" note="Material, colour and motion.">
      <Row title="Theme" note="Graphite for night work, daylight for everything else.">
        <Segmented
          value={s.theme}
          size="sm"
          onChange={(v: ThemeMode) => updateSettings({ theme: v })}
          options={[
            { value: 'dark', label: 'Graphite' },
            { value: 'light', label: 'Daylight' },
            { value: 'auto', label: 'Auto' },
          ]}
        />
      </Row>
      <Row title="Accent" note="One signal colour, used sparingly.">
        <div className="swatches">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className="swatch"
              data-accent={a.id}
              data-on={s.accent === a.id || undefined}
              aria-label={a.label}
              title={a.label}
              onClick={() => updateSettings({ accent: a.id })}
            />
          ))}
        </div>
      </Row>
      <Row title="Surface grain" note="A fine noise layer that keeps large areas from banding.">
        <Toggle on={s.grain} label="Surface grain" onChange={(v) => updateSettings({ grain: v })} />
      </Row>
      <Row title="Motion" note="Reduced removes transitions and the streaming effect. Auto follows the system setting.">
        <Segmented
          value={s.motion}
          size="sm"
          onChange={(v) => updateSettings({ motion: v })}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'auto', label: 'Auto' },
          ]}
        />
      </Row>
      <Row title="Density" note="Compact tightens the vertical rhythm across the app.">
        <Segmented
          value={s.density}
          size="sm"
          onChange={(v) => updateSettings({ density: v })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </Row>
    </Group>
  )
}

/* ----------------------------------------------------------- notifications */

function NotificationsSection() {
  const s = useStore((st) => st.settings)
  return (
    <Group title="Notifications" note="What the system tells you about while you work.">
      <Row title="Model handoff" note="Show a notice when the router switches model mid-conversation.">
        <Toggle on={s.notifyHandoff} label="Model handoff" onChange={(v) => updateSettings({ notifyHandoff: v })} />
      </Row>
      <Row title="Memory captured" note="Show a notice when a new memory is extracted.">
        <Toggle on={s.notifyMemory} label="Memory captured" onChange={(v) => updateSettings({ notifyMemory: v })} />
      </Row>
      <Row title="Token limit" note="Warn when a model drops below its reserve.">
        <Toggle on={s.notifyLimit} label="Token limit" onChange={(v) => updateSettings({ notifyLimit: v })} />
      </Row>
    </Group>
  )
}

/* ----------------------------------------------------------------- privacy */

function PrivacySection() {
  const s = useStore((st) => st.settings)
  return (
    <>
      <Group title="Privacy" note="Where data goes — in this demo, nowhere.">
        <Row title="Keep private topics local" note="Finance, health and family stay on the workstation.">
          <Toggle on={s.localOnly} label="Keep private topics local" onChange={(v) => updateSettings({ localOnly: v })} />
        </Row>
        <Row title="Usage telemetry" note="Anonymous interaction counts. Off by default.">
          <Toggle on={s.telemetry} label="Usage telemetry" onChange={(v) => updateSettings({ telemetry: v })} />
        </Row>
        <Row title="Training opt-out" note="Conversations are never offered to a provider for training.">
          <span className="chip">
            <Icon name="lock" size={11} /> Enforced
          </span>
        </Row>
      </Group>
      <div className="notice">
        <Icon name="shield" size={14} />
        <span>
          This build is a frontend demo. All state lives in this browser&apos;s local storage and
          never leaves the device.
        </span>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------- data */

function DataSection() {
  const state = useStore((s) => s)
  const [confirming, setConfirming] = useState(false)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aio-demo-state-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    emit({ type: 'toast', text: 'Demo state exported', tone: 'ok' })
  }

  return (
    <Group title="Data" note="Everything the demo stores, and how to clear it.">
      <Row title="Storage" note="localStorage · key aio.state.v1">
        <span className="num">
          {(JSON.stringify(state).length / 1024).toFixed(0)} KB
        </span>
      </Row>
      <Row title="Export" note="Download the current demo state as JSON.">
        <button type="button" className="btn btn--sm" onClick={exportJson}>
          <Icon name="database" size={13} /> Export
        </button>
      </Row>
      <Row
        title="Reset demo data"
        note="Restores the seeded models, memories, projects and conversations."
      >
        {confirming ? (
          <span className="row gap-8">
            <button
              type="button"
              className="btn btn--sm btn--danger"
              onClick={() => {
                resetAll()
                setConfirming(false)
                emit({ type: 'toast', text: 'Demo data reset', tone: 'ok' })
                navigate('home')
              }}
            >
              Confirm reset
            </button>
            <button type="button" className="btn btn--sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn--sm" onClick={() => setConfirming(true)}>
            <Icon name="trash" size={13} /> Reset
          </button>
        )}
      </Row>
    </Group>
  )
}
