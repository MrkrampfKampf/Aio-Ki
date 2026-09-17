import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { ModelMark } from './primitives'
import { emit, getState, setState, updateSettings, useBus, useStore } from '../lib/store'
import { decideRoute, drainModel, newConversation, refillModels, syncMemory } from '../lib/engine'
import { navigate } from '../lib/router'
import type { ModelId, ViewName } from '../lib/types'

interface Cmd {
  id: string
  label: string
  hint?: string
  group: string
  icon?: IconName
  model?: ModelId
  keys?: string
  run: () => void
}

function score(q: string, text: string): number {
  if (!q) return 1
  const t = text.toLowerCase()
  const idx = t.indexOf(q)
  if (idx === 0) return 100
  if (idx > 0) return 60 - Math.min(idx, 20)
  // subsequence match, so "swmd" still finds "Switch model"
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length ? 20 : 0
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const projects = useStore((s) => s.projects)
  const memories = useStore((s) => s.memories)
  const theme = useStore((s) => s.settings.theme)

  useBus((e) => {
    if (e.type === 'palette') setOpen((v) => !v)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [open])

  const commands = useMemo<Cmd[]>(() => {
    const go = (view: ViewName, label: string, icon: IconName, keys?: string): Cmd => ({
      id: `go-${view}`,
      label,
      group: 'Navigate',
      icon,
      keys,
      run: () => navigate(view),
    })

    const pickModel = (id: ModelId, name: string): Cmd => ({
      id: `model-${id}`,
      label: `Switch to ${name}`,
      group: 'Models',
      model: id,
      hint: 'Pins the model for the next turns',
      run: () => {
        updateSettings({ routerMode: 'manual' })
        setState({ activeModel: id })
        emit({ type: 'toast', text: `Model pinned to ${name}` })
      },
    })

    return [
      {
        id: 'new-chat',
        label: 'New conversation',
        group: 'Actions',
        icon: 'plus',
        keys: '⌘N',
        run: () => {
          newConversation()
          navigate('chat')
        },
      },
      {
        id: 'sync',
        label: 'Synchronise shared memory',
        group: 'Actions',
        icon: 'refresh',
        run: () => {
          void syncMemory()
          navigate('memory')
        },
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        group: 'Actions',
        icon: 'command',
        keys: '?',
        run: () => emit({ type: 'shortcuts' }),
      },
      {
        id: 'theme',
        label: theme === 'light' ? 'Switch to dark appearance' : 'Switch to light appearance',
        group: 'Actions',
        icon: 'palette',
        run: () => updateSettings({ theme: theme === 'light' ? 'dark' : 'light' }),
      },
      {
        id: 'auto',
        label: 'Use the automatic router',
        group: 'Models',
        icon: 'branch',
        hint: 'Priority order decides per message',
        run: () => {
          updateSettings({ routerMode: 'auto' })
          setState({ activeModel: decideRoute(getState(), true).model })
          emit({ type: 'toast', text: 'Router set to auto' })
        },
      },
      pickModel('claude', 'Claude'),
      pickModel('gpt', 'ChatGPT'),
      pickModel('gemini', 'Gemini'),
      pickModel('local', 'Local'),
      {
        id: 'drain',
        label: 'Simulate token exhaustion',
        group: 'Demo',
        icon: 'flask',
        hint: 'Drains the active model so the next message hands off',
        run: () => {
          drainModel(getState().activeModel)
          navigate('chat')
        },
      },
      {
        id: 'refill',
        label: 'Restore token budgets',
        group: 'Demo',
        icon: 'bolt',
        run: refillModels,
      },
      go('home', 'Go to Home', 'home', 'G H'),
      go('chat', 'Go to Chat', 'chat', 'G C'),
      go('memory', 'Go to Memory', 'memory', 'G M'),
      go('models', 'Go to Models', 'models', 'G D'),
      go('projects', 'Go to Projects', 'projects', 'G P'),
      go('activity', 'Go to Activity', 'activity', 'G A'),
      go('settings', 'Go to Settings', 'settings', 'G S'),
      ...projects.slice(0, 12).map<Cmd>((p) => ({
        id: `p-${p.id}`,
        label: p.name,
        group: 'Projects',
        icon: 'projects',
        hint: `${p.conversations} conversations · ${p.memories} memories`,
        run: () => navigate('projects', p.id),
      })),
    ]
  }, [projects, theme])

  const query = q.trim().toLowerCase()

  const results = useMemo(() => {
    const cmds = commands
      .map((c) => ({ c, s: Math.max(score(query, c.label), score(query, c.group) * 0.4) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 9)
      .map((x) => x.c)

    if (query.length < 2) return cmds

    const mem = memories
      .filter((m) => !m.forgotten)
      .map((m) => ({ m, s: score(query, m.title) || score(query, m.detail) * 0.5 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map<Cmd>(({ m }) => ({
        id: `mem-${m.id}`,
        label: m.title,
        group: 'Memory',
        icon: 'memory',
        hint: `#${m.id} · ${Math.round(m.confidence * 100)}% confidence`,
        run: () => navigate('memory', m.id),
      }))

    return [...cmds, ...mem]
  }, [commands, memories, query])

  useEffect(() => setCursor(0), [query])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>('[data-cursor]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  if (!open) return null

  const grouped: Array<[string, Cmd[]]> = []
  for (const c of results) {
    const last = grouped[grouped.length - 1]
    if (last && last[0] === c.group) last[1].push(c)
    else grouped.push([c.group, [c]])
  }

  const runAt = (i: number) => {
    const cmd = results[i]
    if (!cmd) return
    setOpen(false)
    cmd.run()
  }

  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="cmdk__scrim" onClick={() => setOpen(false)} />
      <div className="cmdk__panel panel">
        <div className="cmdk__field">
          <Icon name="search" size={16} className="dim" />
          <input
            ref={input}
            value={q}
            placeholder="Search commands, models, memories…"
            aria-label="Command palette search"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(c + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(c - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                runAt(cursor)
              }
            }}
          />
          <kbd className="keycap">esc</kbd>
        </div>

        <div className="cmdk__list scroll" ref={listRef}>
          {results.length === 0 ? (
            <p className="cmdk__empty">
              Nothing matches <b>{q}</b>.
            </p>
          ) : null}
          {grouped.map(([group, items]) => (
            <div key={group} className="cmdk__group">
              <span className="label cmdk__group-label">{group}</span>
              {items.map((c) => {
                const i = results.indexOf(c)
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="cmdk__item"
                    data-cursor={i === cursor || undefined}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => runAt(i)}
                  >
                    {c.model ? (
                      <ModelMark id={c.model} size={22} />
                    ) : (
                      <span className="cmdk__icon">
                        <Icon name={c.icon ?? 'arrow'} size={14} />
                      </span>
                    )}
                    <span className="grow trunc">{c.label}</span>
                    {c.hint ? <span className="cmdk__hint trunc">{c.hint}</span> : null}
                    {c.keys ? <kbd className="keycap">{c.keys}</kbd> : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="cmdk__foot">
          <span><kbd className="keycap">↑</kbd><kbd className="keycap">↓</kbd> navigate</span>
          <span><kbd className="keycap">↵</kbd> run</span>
          <span><kbd className="keycap">esc</kbd> close</span>
          <span className="grow" />
          <span className="label">{results.length} results</span>
        </div>
      </div>
    </div>
  )
}
