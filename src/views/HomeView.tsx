import { useMemo } from 'react'
import { Icon } from '../components/Icon'
import { Counter, Meter, ModelMark, SectionLabel } from '../components/primitives'
import { shallowEqualArray, useStore } from '../lib/store'
import { modelStatus } from '../lib/engine'
import { MODEL_NAME } from '../lib/mockData'
import { ago, clock, compact, greeting, stamp } from '../lib/format'
import { navigate } from '../lib/router'
import { useNow } from '../lib/hooks'
import { setState } from '../lib/store'

export function HomeView() {
  const models = useStore((s) => s.models, shallowEqualArray)
  const memories = useStore((s) => s.memories)
  const projects = useStore((s) => s.projects)
  const conversations = useStore((s) => s.conversations)
  const activity = useStore((s) => s.activity)
  const activeId = useStore((s) => s.activeModel)
  const mode = useStore((s) => s.settings.routerMode)
  const lastSync = useStore((s) => s.lastSync)
  const now = useNow(30_000)

  const active = models.find((m) => m.id === activeId) ?? models[0]
  const live = memories.filter((m) => !m.forgotten)
  const activeProjects = projects.filter((p) => p.status === 'active')
  const recent = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [conversations],
  )
  const recentMemories = useMemo(
    () => [...live].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, 5),
    [live],
  )
  const usage = active.local ? 0 : 1 - active.tokens / active.tokensTotal
  const lead = recent[0]
  const lastAi = [...(lead?.messages ?? [])].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="view home">
      <header className="home__mast">
        <div className="home__greet">
          <h2>{greeting()}.</h2>
          <p>
            Your AI system is ready. {models.filter((m) => m.connected).length} models connected,{' '}
            {live.length} memories shared between them.
          </p>
        </div>
        <div className="home__plate">
          <div className="home__plate-row">
            <span className="label">Router</span>
            <span className="mono">{mode === 'auto' ? 'AUTO' : 'MANUAL'}</span>
          </div>
          <div className="home__plate-row">
            <span className="label">Memory sync</span>
            <span className="mono">{ago(lastSync, now)}</span>
          </div>
          <div className="home__plate-row">
            <span className="label">Session</span>
            <span className="mono">{clock(now)}</span>
          </div>
        </div>
      </header>

      <section className="readout panel panel--flat">
        <button className="readout__cell" type="button" onClick={() => navigate('models')} data-model={active.id}>
          <span className="label">Active model</span>
          <span className="readout__value">
            <ModelMark id={active.id} size={22} />
            {active.name}
          </span>
          <span className="readout__meta row gap-6">
            <span className="dot" data-s={modelStatus(active)} />
            {active.variant}
          </span>
        </button>

        <button className="readout__cell" type="button" onClick={() => navigate('models')}>
          <span className="label">Token usage</span>
          <span className="readout__value num">
            {active.local ? '∞' : <Counter value={Math.round(usage * 100)} suffix="%" />}
          </span>
          <span className="readout__meta">
            <Meter value={usage} segments={20} size="sm" />
          </span>
        </button>

        <button className="readout__cell" type="button" onClick={() => navigate('memory')}>
          <span className="label">Memory</span>
          <span className="readout__value num">
            <Counter value={live.length} />
          </span>
          <span className="readout__meta">
            {new Set(live.map((m) => m.entity)).size} entities · {live.filter((m) => m.pinned).length} pinned
          </span>
        </button>

        <button className="readout__cell" type="button" onClick={() => navigate('projects')}>
          <span className="label">Projects</span>
          <span className="readout__value num">
            <Counter value={projects.length} />
          </span>
          <span className="readout__meta">{activeProjects.length} active · {conversations.length} threads</span>
        </button>
      </section>

      {lead ? (
        <section className="continue">
          <div className="continue__body">
            <span className="label">Continue conversation</span>
            <h3>{lead.title}</h3>
            {lastAi ? (
              <p className="continue__excerpt">
                {lastAi.text.split('\n\n')[0].slice(0, 210)}
                {lastAi.text.length > 210 ? '…' : ''}
              </p>
            ) : (
              <p className="continue__excerpt dim">No messages yet in this thread.</p>
            )}
            <div className="continue__meta">
              <span className="label">{stamp(lead.updatedAt)}</span>
              <span className="continue__models">
                {[...new Set(lead.messages.map((m) => m.model).filter(Boolean))].map((id) => (
                  <span key={id} className="continue__model" data-model={id}>
                    <ModelMark id={id!} size={18} />
                  </span>
                ))}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="continue__action"
            onClick={() => {
              setState({ activeConversation: lead.id })
              navigate('chat')
            }}
          >
            <span className="continue__action-ring" aria-hidden="true" />
            <Icon name="arrow" size={22} />
            <span className="label">Resume</span>
          </button>
        </section>
      ) : null}

      <div className="home__cols">
        <section className="home__col">
          <SectionLabel
            right={
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('models')}>
                All models <Icon name="chevron" size={12} />
              </button>
            }
          >
            Recently used models
          </SectionLabel>
          <div className="home__list">
            {models.map((m) => {
              const st = modelStatus(m)
              const last = activity.find((a) => a.model === m.id)
              return (
                <button key={m.id} type="button" className="row-item" data-model={m.id} onClick={() => navigate('models')}>
                  <ModelMark id={m.id} size={28} />
                  <span className="grow">
                    <b>{m.name}</b>
                    <em>{last ? `${last.title} · ${ago(last.at, now)}` : m.variant}</em>
                  </span>
                  <span className="row-item__right">
                    <span className="num">{m.local ? '∞' : compact(m.tokens)}</span>
                    <span className="row gap-6">
                      <span className="dot" data-s={st} />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="home__col">
          <SectionLabel
            right={
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('memory')}>
                Open memory <Icon name="chevron" size={12} />
              </button>
            }
          >
            Recent memories
          </SectionLabel>
          <div className="home__list">
            {recentMemories.map((m) => (
              <button key={m.id} type="button" className="row-item" onClick={() => navigate('memory', m.id)}>
                <span className="row-item__id mono">#{m.id}</span>
                <span className="grow">
                  <b className="trunc">{m.title}</b>
                  <em>
                    {MODEL_NAME[m.source]} · {ago(m.lastUsedAt, now)}
                  </em>
                </span>
                <span className="row-item__conf num">{Math.round(m.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        </section>

        <section className="home__col">
          <SectionLabel
            right={
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('projects')}>
                All projects <Icon name="chevron" size={12} />
              </button>
            }
          >
            Active projects
          </SectionLabel>
          <div className="home__list">
            {activeProjects.slice(0, 5).map((p) => (
              <button key={p.id} type="button" className="row-item" onClick={() => navigate('projects', p.id)}>
                <span className="row-item__ring" style={{ '--p': p.progress } as React.CSSProperties} aria-hidden="true">
                  <span className="num">{Math.round(p.progress * 100)}</span>
                </span>
                <span className="grow">
                  <b className="trunc">{p.name}</b>
                  <em>
                    {p.conversations} conversations · {p.memories} memories
                  </em>
                </span>
                <span className="row-item__models">
                  {p.models.slice(0, 3).map((id) => (
                    <span key={id} data-model={id} className="row-item__pip" />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
