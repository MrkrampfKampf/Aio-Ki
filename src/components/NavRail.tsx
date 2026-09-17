import { useEffect } from 'react'
import { Icon, type IconName } from './Icon'
import { linkTo, navigate } from '../lib/router'
import type { AppState, ViewName } from '../lib/types'
import { shallowEqualArray, useStore } from '../lib/store'
import { ago } from '../lib/format'
import { useNow } from '../lib/hooks'

const ITEMS: Array<{ view: ViewName; icon: IconName; label: string; key: string }> = [
  { view: 'home', icon: 'home', label: 'Home', key: 'H' },
  { view: 'chat', icon: 'chat', label: 'Chat', key: 'C' },
  { view: 'memory', icon: 'memory', label: 'Memory', key: 'M' },
  { view: 'models', icon: 'models', label: 'Models', key: 'D' },
  { view: 'projects', icon: 'projects', label: 'Projects', key: 'P' },
  { view: 'activity', icon: 'activity', label: 'Activity', key: 'A' },
  { view: 'settings', icon: 'settings', label: 'Settings', key: 'S' },
]

const counts = (s: AppState) =>
  [
    s.memories.filter((m) => !m.forgotten).length,
    s.conversations.length,
    s.projects.length,
    s.activity.length,
  ] as const

export function NavRail({
  active,
  open,
  onClose,
}: {
  active: ViewName
  open: boolean
  onClose: () => void
}) {
  const [memories, chats, projects, events] = useStore(counts, shallowEqualArray)
  const syncing = useStore((s) => s.syncing)
  const lastSync = useStore((s) => s.lastSync)
  const now = useNow(20_000)

  useEffect(() => {
    if (open) onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const badge: Partial<Record<ViewName, number>> = {
    memory: memories,
    chat: chats,
    projects: projects,
    activity: events,
  }

  return (
    <nav className="rail" data-open={open || undefined} aria-label="Primary">
      <div className="rail__brand">
        <span className="rail__glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10.2" stroke="currentColor" strokeOpacity=".22" />
            <path d="M12 2.4a9.6 9.6 0 0 1 8.3 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M20.3 16.8A9.6 9.6 0 0 1 12 21.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity=".55" />
            <path d="M3.7 16.8a9.6 9.6 0 0 1 0-9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity=".3" />
            <circle cx="12" cy="12" r="3.4" fill="currentColor" />
          </svg>
        </span>
        <span className="rail__wordmark">
          <b>AIO</b>
          <em>personal ai system</em>
        </span>
        <button type="button" className="rail__close btn btn--ghost btn--sm" onClick={onClose} aria-label="Close navigation">
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="rail__items">
        {ITEMS.map((it) => (
          <a
            key={it.view}
            href={linkTo(it.view)}
            className="rail__item"
            data-on={active === it.view || undefined}
            aria-current={active === it.view ? 'page' : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return
              e.preventDefault()
              navigate(it.view)
            }}
          >
            <span className="rail__bar" aria-hidden="true" />
            <Icon name={it.icon} size={17} className="rail__icon" />
            <span className="rail__label">{it.label}</span>
            {badge[it.view] !== undefined ? (
              <span className="rail__count num">{badge[it.view]}</span>
            ) : (
              <span className="rail__key">{it.key}</span>
            )}
          </a>
        ))}
      </div>

      <div className="rail__foot">
        <div className="rail__sync" data-busy={syncing || undefined}>
          <span className="rail__sync-dot" aria-hidden="true" />
          <span className="label">{syncing ? 'Synchronising' : 'Memory synced'}</span>
          <span className="rail__sync-time mono">{syncing ? '···' : ago(lastSync, now)}</span>
        </div>
        <div className="rail__user">
          <span className="rail__avatar" aria-hidden="true">M</span>
          <span className="grow">
            <b>Matteo</b>
            <em>Local profile</em>
          </span>
          <Icon name="chevron" size={13} className="dim" />
        </div>
      </div>
    </nav>
  )
}
