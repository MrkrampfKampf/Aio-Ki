import { Icon } from './Icon'
import { ModelPicker } from './ModelPicker'
import { emit, useStore } from '../lib/store'
import { clockS } from '../lib/format'
import { useNow } from '../lib/hooks'
import type { ViewName } from '../lib/types'

const TITLE: Record<ViewName, [string, string]> = {
  home: ['Overview', 'System status and recent work'],
  chat: ['Chat', 'Shared memory · automatic routing'],
  memory: ['Shared memory', 'One memory. Every model.'],
  models: ['Models & router', 'Availability, budgets and priority'],
  projects: ['Projects', 'Conversations, memories and models by project'],
  activity: ['Activity', 'Everything the system did'],
  settings: ['Settings', 'Models, routing, memory, appearance'],
}

export function StatusBar({ view, onMenu }: { view: ViewName; onMenu: () => void }) {
  const mode = useStore((s) => s.settings.routerMode)
  const syncing = useStore((s) => s.syncing)
  const localOnly = useStore((s) => s.settings.localOnly)
  const now = useNow(1000)
  const [title, sub] = TITLE[view]

  return (
    <header className="bar">
      <button type="button" className="bar__menu btn btn--ghost btn--sm" onClick={onMenu} aria-label="Open navigation">
        <Icon name="menu" size={16} />
      </button>

      <div className="bar__title">
        <h1>{title}</h1>
        <span className="bar__sub label">{sub}</span>
      </div>

      <span className="grow" />

      {localOnly ? (
        <span className="chip bar__hide-sm" title="Only on-device models are used">
          <Icon name="lock" size={11} />
          Local only
        </span>
      ) : null}

      <span className="bar__sync chip bar__hide-sm" data-busy={syncing || undefined}>
        <Icon name="refresh" size={11} className="bar__sync-icon" />
        {syncing ? 'Syncing' : 'Synced'}
      </span>

      <span className="chip bar__hide-md" data-mode={mode}>
        <Icon name="branch" size={11} />
        Router {mode}
      </span>

      <ModelPicker />

      <button
        type="button"
        className="bar__cmd"
        onClick={() => emit({ type: 'palette' })}
        aria-label="Open command palette"
      >
        <Icon name="search" size={13} />
        <span className="bar__cmd-text">Search</span>
        <kbd className="keycap">⌘K</kbd>
      </button>

      <time className="bar__clock num bar__hide-md" dateTime={new Date(now).toISOString()}>
        {clockS(now)}
      </time>
    </header>
  )
}
