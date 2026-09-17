import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { Counter, ModelMark, Segmented } from '../components/primitives'
import { MemoryGraph } from '../components/MemoryGraph'
import { shallowEqualArray, useStore } from '../lib/store'
import { editMemory, forgetMemory, pinMemory, restoreMemory, syncMemory } from '../lib/engine'
import { MODEL_NAME } from '../lib/mockData'
import { ago, dateFull, stamp } from '../lib/format'
import { navigate } from '../lib/router'
import { useNow } from '../lib/hooks'
import type { Entity, Memory, MemoryKind, ModelId } from '../lib/types'

type Mode = 'graph' | 'tree' | 'list'

const KINDS: Array<MemoryKind | 'all'> = ['all', 'preference', 'project', 'person', 'fact', 'skill', 'interest', 'event']

export function MemoryView({ focus }: { focus?: string }) {
  const memories = useStore((s) => s.memories)
  const entities = useStore((s) => s.entities, shallowEqualArray)
  const lastSync = useStore((s) => s.lastSync)
  const syncing = useStore((s) => s.syncing)
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 900 ? 'tree' : 'graph',
  )
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(focus ?? null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<MemoryKind | 'all'>('all')
  const [showForgotten, setShowForgotten] = useState(false)
  const now = useNow(30_000)

  useEffect(() => {
    if (!focus) return
    setOpen(focus)
    setMode((m) => (m === 'graph' ? m : 'list'))
  }, [focus])

  const live = memories.filter((m) => !m.forgotten)
  const projects = useStore((s) => s.projects)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return memories
      .filter((m) => (showForgotten ? true : !m.forgotten))
      .filter((m) => (kind === 'all' ? true : m.kind === kind))
      .filter((m) => (selectedEntity && mode !== 'list' ? m.entity === selectedEntity : true))
      .filter((m) =>
        needle
          ? `${m.id} ${m.title} ${m.detail} ${m.tags.join(' ')}`.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  }, [memories, q, kind, showForgotten, selectedEntity, mode])

  const current = open ? memories.find((m) => m.id === open) ?? null : null

  return (
    <div className="view memory">
      <header className="memory__head">
        <div>
          <span className="label">Shared memory</span>
          <h2 className="memory__title">One memory. Every model.</h2>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void syncMemory()}
          disabled={syncing}
        >
          <Icon name="refresh" size={14} className={syncing ? 'spin' : undefined} />
          {syncing ? 'Synchronising' : 'Synchronise'}
        </button>
      </header>

      <section className="memory__stats panel panel--flat">
        <div className="memory__stat">
          <span className="label">Memories</span>
          <span className="memory__stat-value num"><Counter value={live.length} /></span>
        </div>
        <div className="memory__stat">
          <span className="label">Entities</span>
          <span className="memory__stat-value num"><Counter value={entities.length} /></span>
        </div>
        <div className="memory__stat">
          <span className="label">Projects</span>
          <span className="memory__stat-value num"><Counter value={projects.length} /></span>
        </div>
        <div className="memory__stat">
          <span className="label">Shared with</span>
          <span className="memory__stat-value">4 models</span>
        </div>
        <div className="memory__stat memory__stat--wide">
          <span className="label">Last synchronised</span>
          <span className="memory__stat-value memory__stat-value--sm">
            <span className="dot" data-s={syncing ? 'warn' : 'ok'} />
            {syncing ? 'in progress' : ago(lastSync, now)}
          </span>
        </div>
      </section>

      <div className="memory__toolbar">
        <Segmented
          value={mode}
          size="sm"
          onChange={(v) => setMode(v)}
          options={[
            { value: 'graph', label: 'Graph', icon: 'graph' },
            { value: 'tree', label: 'Tree', icon: 'branch' },
            { value: 'list', label: 'List', icon: 'list' },
          ]}
        />
        <div className="memory__search">
          <Icon name="search" size={14} className="dim" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search memories…"
            aria-label="Search memories"
          />
          {q ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQ('')} aria-label="Clear">
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </div>
        <span className="grow" />
        {mode === 'list' ? (
          <>
            <div className="memory__kinds">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="memory__kind"
                  data-on={kind === k || undefined}
                  onClick={() => setKind(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn--sm"
              data-on={showForgotten || undefined}
              onClick={() => setShowForgotten((v) => !v)}
            >
              <Icon name={showForgotten ? 'check' : 'trash'} size={12} />
              Forgotten
            </button>
          </>
        ) : null}
      </div>

      <div className="memory__body">
        {mode === 'graph' ? (
          <div className="memory__graph panel" data-syncing={syncing || undefined}>
            <MemoryGraph
              entities={entities}
              memories={memories}
              selected={selectedEntity}
              onSelect={setSelectedEntity}
              onOpenMemory={setOpen}
            />
            <EntityPane
              entity={entities.find((e) => e.id === selectedEntity) ?? null}
              memories={filtered}
              onOpen={setOpen}
              onClear={() => setSelectedEntity(null)}
            />
          </div>
        ) : null}

        {mode === 'tree' ? (
          <Tree entities={entities} memories={memories} onOpen={setOpen} />
        ) : null}

        {mode === 'list' ? (
          <div className="memory__list">
            <div className="memory__list-head">
              <span className="label">{filtered.length} memories</span>
              <span className="label">Sorted by last use</span>
            </div>
            {filtered.slice(0, 120).map((m) => (
              <button
                key={m.id}
                type="button"
                className="mem-row"
                data-forgotten={m.forgotten || undefined}
                data-on={open === m.id || undefined}
                onClick={() => setOpen(m.id)}
              >
                <span className="mem-row__id mono">#{m.id}</span>
                <span className="grow">
                  <b>{m.title}</b>
                  <em className="trunc">{m.detail}</em>
                </span>
                <span className="mem-row__kind label">{m.kind}</span>
                <span className="mem-row__models">
                  {m.usedBy.map((id) => (
                    <span key={id} className="mem-row__pip" data-model={id} title={MODEL_NAME[id]} />
                  ))}
                </span>
                <span className="mem-row__conf num">{Math.round(m.confidence * 100)}%</span>
              </button>
            ))}
            {filtered.length > 120 ? (
              <p className="memory__more label">
                Showing the first 120 of {filtered.length}. Narrow the search to see more.
              </p>
            ) : null}
            {filtered.length === 0 ? <p className="memory__more">No memories match that filter.</p> : null}
          </div>
        ) : null}
      </div>

      {current ? <MemorySheet memory={current} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

/* -------------------------------------------------------------- entity pane */

function EntityPane({
  entity,
  memories,
  onOpen,
  onClear,
}: {
  entity: Entity | null
  memories: Memory[]
  onOpen: (id: string) => void
  onClear: () => void
}) {
  if (!entity) {
    return (
      <aside className="entity-pane entity-pane--empty">
        <p className="label">Select a node</p>
        <p>
          The graph maps every entity the system knows about. Selecting one brings up its memories
          and shows which models have already used them.
        </p>
      </aside>
    )
  }
  return (
    <aside className="entity-pane">
      <header>
        <span className="label">{entity.kind}</span>
        <h3>{entity.label}</h3>
        {entity.note ? <p className="dim">{entity.note}</p> : null}
        <button type="button" className="btn btn--ghost btn--sm entity-pane__close" onClick={onClear} aria-label="Clear selection">
          <Icon name="close" size={13} />
        </button>
      </header>
      <div className="entity-pane__list scroll">
        {memories.map((m) => (
          <button key={m.id} type="button" className="entity-pane__item" onClick={() => onOpen(m.id)}>
            <span className="mono">#{m.id}</span>
            <span className="grow">{m.title}</span>
          </button>
        ))}
        {memories.length === 0 ? <p className="dim">No memories on this node yet.</p> : null}
      </div>
    </aside>
  )
}

/* -------------------------------------------------------------------- tree */

function Tree({
  entities,
  memories,
  onOpen,
}: {
  entities: Entity[]
  memories: Memory[]
  onOpen: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['matteo', 'music', 'work']))

  const childrenOf = (id: string | null) => entities.filter((e) => e.parent === id)
  const memsOf = (id: string) => memories.filter((m) => m.entity === id && !m.forgotten)

  const render = (e: Entity, depth: number): React.ReactNode => {
    const kids = childrenOf(e.id)
    const mems = memsOf(e.id)
    const isOpen = expanded.has(e.id)
    return (
      <div key={e.id} className="tree__node" style={{ '--d': depth } as React.CSSProperties}>
        <button
          type="button"
          className="tree__row"
          data-open={isOpen || undefined}
          onClick={() =>
            setExpanded((s) => {
              const n = new Set(s)
              if (n.has(e.id)) n.delete(e.id)
              else n.add(e.id)
              return n
            })
          }
        >
          <span className="tree__caret">
            {kids.length || mems.length ? <Icon name="chevron" size={11} /> : <span className="tree__leaf" />}
          </span>
          <span className="tree__label">{e.label}</span>
          {e.note ? <span className="tree__note label">{e.note}</span> : null}
          <span className="grow" />
          <span className="tree__count num">{mems.length}</span>
        </button>
        {isOpen ? (
          <div className="tree__children">
            {kids.map((k) => render(k, depth + 1))}
            {mems.slice(0, 8).map((m) => (
              <button
                key={m.id}
                type="button"
                className="tree__mem"
                style={{ '--d': depth + 1 } as React.CSSProperties}
                onClick={() => onOpen(m.id)}
              >
                <span className="mono">#{m.id}</span>
                <span className="trunc">{m.title}</span>
              </button>
            ))}
            {mems.length > 8 ? (
              <span className="tree__mem tree__mem--more label" style={{ '--d': depth + 1 } as React.CSSProperties}>
                + {mems.length - 8} more
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const roots = childrenOf(null)
  return <div className="tree panel">{roots.map((r) => render(r, 0))}</div>
}

/* ------------------------------------------------------------ memory sheet */

function MemorySheet({ memory, onClose }: { memory: Memory; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(memory.title)
  const [detail, setDetail] = useState(memory.detail)

  useEffect(() => {
    setTitle(memory.title)
    setDetail(memory.detail)
    setEditing(false)
  }, [memory.id, memory.title, memory.detail])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Rendered at the document root: a backdrop-filter nested inside another one
  // has nothing to sample in Chromium, and the sheet would stop frosting.
  return createPortal(
    <div className="sheet" role="dialog" aria-label={`Memory ${memory.id}`}>
      <div className="sheet__scrim" onClick={onClose} />
      <div className="sheet__panel panel">
        <header className="sheet__head">
          <span className="label">Memory #{memory.id}</span>
          <span className="grow" />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => pinMemory(memory.id, !memory.pinned)}
            aria-pressed={memory.pinned}
          >
            <Icon name="pin" size={13} /> {memory.pinned ? 'Pinned' : 'Pin'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="sheet__body scroll">
          {editing ? (
            <>
              <input
                className="sheet__title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Memory title"
              />
              <textarea
                className="sheet__detail-input"
                value={detail}
                rows={5}
                onChange={(e) => setDetail(e.target.value)}
                aria-label="Memory detail"
              />
            </>
          ) : (
            <>
              <h3 className="sheet__title">{memory.title}</h3>
              <p className="sheet__detail">{memory.detail}</p>
            </>
          )}

          <dl className="sheet__facts">
            <Fact label="Source">
              <span className="row gap-8">
                <ModelMark id={memory.source} size={20} />
                {memory.sourceLabel}
              </span>
            </Fact>
            <Fact label="Captured">{dateFull(memory.createdAt)}</Fact>
            <Fact label="Last used">{stamp(memory.lastUsedAt)}</Fact>
            <Fact label="Times used">{memory.uses}</Fact>
            <Fact label="Entity">{memory.entity}</Fact>
            <Fact label="Kind">{memory.kind}</Fact>
          </dl>

          <div className="sheet__block">
            <span className="label">Used by</span>
            <div className="sheet__models">
              {(['claude', 'gpt', 'gemini', 'local'] as ModelId[]).map((id) => (
                <span key={id} className="sheet__model" data-on={memory.usedBy.includes(id) || undefined} data-model={id}>
                  <ModelMark id={id} size={20} />
                  {MODEL_NAME[id]}
                  {memory.usedBy.includes(id) ? <Icon name="check" size={12} /> : null}
                </span>
              ))}
            </div>
          </div>

          <div className="sheet__block">
            <span className="label">Confidence</span>
            <div className="sheet__conf">
              <div className="sheet__conf-track">
                <span className="sheet__conf-fill" style={{ width: `${memory.confidence * 100}%` }} />
              </div>
              <span className="num">{Math.round(memory.confidence * 100)}%</span>
            </div>
          </div>

          {memory.tags.length ? (
            <div className="sheet__block">
              <span className="label">Tags</span>
              <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
                {memory.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {memory.forgotten ? (
            <p className="sheet__warn">
              <Icon name="trash" size={13} /> This memory is forgotten. No model receives it as context.
            </p>
          ) : null}
        </div>

        <footer className="sheet__foot">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  editMemory(memory.id, { title: title.trim() || memory.title, detail })
                  setEditing(false)
                }}
              >
                <Icon name="check" size={14} /> Save
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                <Icon name="edit" size={14} /> Edit
              </button>
              {memory.forgotten ? (
                <button type="button" className="btn" onClick={() => restoreMemory(memory.id)}>
                  <Icon name="refresh" size={14} /> Restore
                </button>
              ) : (
                <button type="button" className="btn btn--danger" onClick={() => forgetMemory(memory.id)}>
                  <Icon name="trash" size={14} /> Forget
                </button>
              )}
              <span className="grow" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('activity')}>
                History <Icon name="chevron" size={12} />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sheet__fact">
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
