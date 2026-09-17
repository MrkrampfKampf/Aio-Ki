import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Counter, ModelMark, SectionLabel, Segmented } from '../components/primitives'
import { setState, useStore } from '../lib/store'
import { newConversation } from '../lib/engine'
import { MODEL_NAME } from '../lib/mockData'
import { ago, stamp } from '../lib/format'
import { navigate } from '../lib/router'
import { useNow } from '../lib/hooks'
import type { Project } from '../lib/types'

type Filter = 'all' | 'active' | 'paused' | 'archived'

export function ProjectsView({ focus }: { focus?: string }) {
  const projects = useStore((s) => s.projects)
  const [filter, setFilter] = useState<Filter>('all')
  const now = useNow(30_000)

  const open = focus ? projects.find((p) => p.id === focus) : undefined
  const list = useMemo(
    () =>
      projects
        .filter((p) => (filter === 'all' ? true : p.status === filter))
        .sort((a, b) => b.lastActivity - a.lastActivity),
    [projects, filter],
  )

  if (open) return <ProjectDetail project={open} />

  return (
    <div className="view projects">
      <header className="projects__head">
        <div>
          <span className="label">Projects</span>
          <h2>
            <Counter value={projects.length} /> workspaces
          </h2>
          <p className="dim">
            A project groups conversations, memories and the models that worked on them.
          </p>
        </div>
        <div className="projects__head-tools">
          <Segmented
            value={filter}
            size="sm"
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              newConversation()
              navigate('chat')
            }}
          >
            <Icon name="plus" size={13} /> New thread
          </button>
        </div>
      </header>

      <div className="projects__grid">
        {list.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="project rise"
            data-status={p.status}
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => navigate('projects', p.id)}
          >
            <header className="project__head">
              <span className="project__status label">
                <span className="dot" data-s={p.status === 'active' ? 'ok' : p.status === 'paused' ? 'warn' : 'idle'} />
                {p.status}
              </span>
              <span className="grow" />
              <span className="label">{ago(p.lastActivity, now)}</span>
            </header>

            <h3 className="project__name">{p.name}</h3>
            <p className="project__blurb">{p.blurb}</p>

            <div className="project__bar">
              <span className="project__bar-fill" style={{ width: `${p.progress * 100}%` }} />
            </div>

            <dl className="project__stats">
              <div>
                <dt className="label">Conversations</dt>
                <dd className="num">{p.conversations}</dd>
              </div>
              <div>
                <dt className="label">Models</dt>
                <dd className="num">{p.models.length}</dd>
              </div>
              <div>
                <dt className="label">Memories</dt>
                <dd className="num">{p.memories}</dd>
              </div>
            </dl>

            <footer className="project__foot">
              <span className="project__models">
                {p.models.map((id) => (
                  <span key={id} className="project__model" title={MODEL_NAME[id]}>
                    <ModelMark id={id} size={20} />
                  </span>
                ))}
              </span>
              <span className="grow" />
              <Icon name="chevron" size={14} className="project__go" />
            </footer>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ detail */

function ProjectDetail({ project }: { project: Project }) {
  const conversations = useStore((s) => s.conversations)
  const memories = useStore((s) => s.memories)
  const activity = useStore((s) => s.activity)
  const now = useNow(30_000)

  const threads = conversations.filter((c) => c.projectId === project.id)
  const tags = new Set(project.tags)
  const related = memories
    .filter((m) => !m.forgotten && (tags.has(m.entity) || m.tags.some((t) => tags.has(t))))
    .slice(0, 8)
  const events = activity.filter((e) => e.detail?.includes(project.name)).slice(0, 6)

  return (
    <div className="view project-detail">
      <button type="button" className="btn btn--ghost btn--sm back" onClick={() => navigate('projects')}>
        <Icon name="chevronDown" size={13} className="flip-left" /> All projects
      </button>

      <header className="project-detail__head">
        <div>
          <span className="label">
            <span className="dot" data-s={project.status === 'active' ? 'ok' : 'idle'} /> {project.status}
          </span>
          <h2>{project.name}</h2>
          <p>{project.blurb}</p>
        </div>
        <div className="project-detail__nums">
          <div>
            <span className="label">Conversations</span>
            <span className="num"><Counter value={project.conversations} /></span>
          </div>
          <div>
            <span className="label">Memories</span>
            <span className="num"><Counter value={project.memories} /></span>
          </div>
          <div>
            <span className="label">Progress</span>
            <span className="num">{Math.round(project.progress * 100)}%</span>
          </div>
          <div>
            <span className="label">Last activity</span>
            <span className="num">{stamp(project.lastActivity)}</span>
          </div>
        </div>
      </header>

      <div className="project-detail__cols">
        <section>
          <SectionLabel
            right={
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  newConversation(project.id)
                  navigate('chat')
                }}
              >
                <Icon name="plus" size={12} /> New
              </button>
            }
          >
            Conversations
          </SectionLabel>
          <div className="home__list">
            {threads.map((c) => (
              <button
                key={c.id}
                type="button"
                className="row-item"
                onClick={() => {
                  setState({ activeConversation: c.id })
                  navigate('chat')
                }}
              >
                <span className="row-item__id mono">
                  <Icon name="chat" size={13} />
                </span>
                <span className="grow">
                  <b className="trunc">{c.title}</b>
                  <em>
                    {c.messages.length} messages · {ago(c.updatedAt, now)}
                  </em>
                </span>
                <span className="row-item__models">
                  {[...new Set(c.messages.map((m) => m.model).filter(Boolean))].map((id) => (
                    <span key={id} className="row-item__pip" data-model={id} />
                  ))}
                </span>
              </button>
            ))}
            {threads.length === 0 ? <p className="dim">No threads linked to this project yet.</p> : null}
          </div>
        </section>

        <section>
          <SectionLabel>Models used</SectionLabel>
          <div className="project-detail__models">
            {project.models.map((id) => (
              <div key={id} className="project-detail__model" data-model={id}>
                <ModelMark id={id} size={26} />
                <span className="grow">{MODEL_NAME[id]}</span>
                <Icon name="check" size={13} />
              </div>
            ))}
          </div>

          <SectionLabel>Related memory</SectionLabel>
          <div className="home__list">
            {related.map((m) => (
              <button key={m.id} type="button" className="row-item" onClick={() => navigate('memory', m.id)}>
                <span className="row-item__id mono">#{m.id}</span>
                <span className="grow">
                  <b className="trunc">{m.title}</b>
                  <em>{m.kind}</em>
                </span>
                <span className="row-item__conf num">{Math.round(m.confidence * 100)}%</span>
              </button>
            ))}
            {related.length === 0 ? <p className="dim">Nothing tagged to this project yet.</p> : null}
          </div>

          {events.length ? (
            <>
              <SectionLabel>Recent events</SectionLabel>
              <div className="home__list">
                {events.map((e) => (
                  <div key={e.id} className="row-item" style={{ cursor: 'default' }}>
                    <span className="row-item__id mono">{ago(e.at, now)}</span>
                    <span className="grow">
                      <b className="trunc">{e.title}</b>
                      <em className="trunc">{e.detail}</em>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
