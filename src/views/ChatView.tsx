import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { ModelPicker } from '../components/ModelPicker'
import { HandoffRow } from '../components/HandoffRow'
import { Counter, Meter, ModelMark } from '../components/primitives'
import { emit, getState, setState, shallowEqualArray, updateSettings, useBus, useStore } from '../lib/store'
import {
  drainModel,
  promptCost,
  isGenerating,
  modelStatus,
  partialBudget,
  newConversation,
  refillModels,
  retrieve,
  sendMessage,
  stopGeneration,
} from '../lib/engine'
import { MODEL_NAME } from '../lib/mockData'
import { clock, compact, stamp } from '../lib/format'
import { useClickOutside } from '../lib/hooks'
import { navigate } from '../lib/router'
import type { Conversation, Memory, Message } from '../lib/types'

const PROMPTS = [
  'Wie strukturiere ich die zweite Hälfte von Track 3?',
  'Was weißt du über meinen PC-Build?',
  'Plan the first week in Vancouver',
  'Warum hast du gerade das Modell gewechselt?',
]

export function ChatView() {
  const conversations = useStore((s) => s.conversations)
  const activeId = useStore((s) => s.activeConversation)
  const conv = conversations.find((c) => c.id === activeId) ?? conversations[0]
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const area = useRef<HTMLTextAreaElement>(null)

  const context = useMemo(
    () => (draft.trim().length > 3 ? retrieve(draft, getState(), 3) : []),
    [draft],
  )

  const toBottom = (smooth = true) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Follow the transcript whenever it grows, as long as the reader is at the
  // bottom. Watching the element covers streamed text, late chips and reflow
  // alike — tracking message state would miss all three.
  useLayoutEffect(() => {
    const thread = scroller.current?.firstElementChild
    if (!thread) return
    const ro = new ResizeObserver(() => {
      if (stick.current) toBottom(false)
    })
    ro.observe(thread)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    stick.current = true
    toBottom(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  useBus((e) => {
    if (e.type === 'focus-composer') area.current?.focus()
  })

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`
  }, [draft])

  const submit = async () => {
    const text = draft.trim()
    if (!text || isGenerating()) return
    setDraft('')
    stick.current = true
    setBusy(true)
    await sendMessage(text)
    setBusy(false)
  }

  return (
    <div className="chat">
      <div className="chat__main">
        <ChatHeader conv={conv} />

        <div
          className="chat__scroll scroll"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
          }}
        >
          <div className="chat__thread">
            <ThreadHead conv={conv} />
            {conv.messages.map((m, i) => (
              <Bubble key={m.id} message={m} prev={conv.messages[i - 1]} />
            ))}
            {conv.messages.length === 0 ? <EmptyThread onPick={setDraft} /> : null}
            <div className="chat__tail" />
          </div>
        </div>

        <div className="composer">
          {context.length ? (
            <div className="composer__ctx">
              <span className="label">Context</span>
              {context.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="composer__ctx-chip"
                  title={m.detail}
                  onClick={() => navigate('memory', m.id)}
                >
                  <span className="composer__ctx-id mono">#{m.id}</span>
                  <span className="trunc">{m.title}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="composer__slab">
            <textarea
              ref={area}
              className="composer__input"
              value={draft}
              rows={1}
              placeholder="Ask anything — the router picks the model."
              aria-label="Message"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
            />
            <div className="composer__foot">
              <RoutePreview />
              <span className="grow" />
              <span className="composer__est label">
                {draft.trim()
                  ? `≈ ${promptCost(draft, context.length).toLocaleString('en-US')} tokens in`
                  : 'Enter to send · Shift+Enter for a new line'}
              </span>
              {busy ? (
                <button type="button" className="btn btn--sm" onClick={stopGeneration}>
                  <Icon name="stop" size={12} /> Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary btn--sm composer__send"
                  disabled={!draft.trim()}
                  onClick={() => void submit()}
                  aria-label="Send message"
                >
                  <Icon name="send" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ContextRail conv={conv} />
    </div>
  )
}

/* ----------------------------------------------------------------- header */

function ChatHeader({ conv }: { conv: Conversation }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const conversations = useStore((s) => s.conversations)

  return (
    <header className="chat__head">
      <ModelPicker variant="header" />
      <span className="grow" />

      <div className="chat__threads" ref={ref}>
        <button type="button" className="chat__thread-btn" onClick={() => setOpen((v) => !v)}>
          <span className="label">Conversation</span>
          <span className="chat__thread-name trunc">{conv.title}</span>
          <Icon name="chevronDown" size={13} className="dim" />
        </button>
        {open ? (
          <div className="chat__thread-pop panel">
            <div className="chat__thread-list scroll">
              {conversations.slice(0, 18).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="chat__thread-item"
                  data-on={c.id === conv.id || undefined}
                  onClick={() => {
                    setState({ activeConversation: c.id })
                    setOpen(false)
                  }}
                >
                  <span className="grow trunc">{c.title}</span>
                  <span className="label">{clock(c.updatedAt)}</span>
                </button>
              ))}
            </div>
            <hr className="hair" />
            <button
              type="button"
              className="chat__thread-item"
              onClick={() => {
                newConversation()
                setOpen(false)
              }}
            >
              <Icon name="plus" size={13} />
              <span className="grow">New conversation</span>
              <kbd className="keycap">⌘N</kbd>
            </button>
          </div>
        ) : null}
      </div>

      <DemoMenu />
    </header>
  )
}

function ThreadHead({ conv }: { conv: Conversation }) {
  const project = useStore((s) => s.projects.find((p) => p.id === conv.projectId))
  return (
    <div className="thread-head">
      <h2>{conv.title}</h2>
      <div className="thread-head__meta">
        {project ? (
          <button type="button" className="chip" onClick={() => navigate('projects', project.id)}>
            <Icon name="projects" size={11} /> {project.name}
          </button>
        ) : null}
        <span className="label">Started {stamp(conv.createdAt)}</span>
        <span className="label">{conv.messages.filter((m) => m.role !== 'system').length} messages</span>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- messages */

function Bubble({ message, prev }: { message: Message; prev?: Message }) {
  const memories = useStore((s) => s.memories)

  if (message.role === 'system' && message.handoff) {
    return <HandoffRow handoff={message.handoff} at={message.at} />
  }

  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="msg__slab">{message.text}</div>
        <span className="msg__time label">{clock(message.at)}</span>
      </div>
    )
  }

  const model = message.model ?? 'claude'
  const sameAsPrev = prev?.role === 'assistant' && prev.model === model
  const cited = (message.context ?? [])
    .map((id) => memories.find((m) => m.id === id))
    .filter((m): m is Memory => Boolean(m))

  return (
    <div className="msg msg--ai" data-model={model}>
      {!sameAsPrev ? (
        <div className="msg__head">
          <ModelMark id={model} size={22} />
          <b>{MODEL_NAME[model]}</b>
          <span className="label">{clock(message.at)}</span>
          {message.tokens ? <span className="label">{compact(message.tokens)} tokens</span> : null}
        </div>
      ) : null}

      <div className="msg__body">
        {message.text.split('\n\n').map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {message.streaming ? <span className="msg__caret" /> : null}
        {message.truncated ? (
          <p className="msg__cut">
            <Icon name="bolt" size={12} />
            Cut off — {MODEL_NAME[model]} reached its token limit here.
          </p>
        ) : null}
      </div>

      {cited.length && !message.streaming ? (
        <div className="msg__cited">
          <span className="label">Used memory</span>
          {cited.map((m) => (
            <button key={m.id} type="button" className="msg__cite" onClick={() => navigate('memory', m.id)}>
              #{m.id} {m.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function EmptyThread({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="chat__empty">
      <p className="chat__empty-lead">
        New thread. The router will pick a model when you send, and the shared memory comes along.
      </p>
      <div className="chat__empty-grid">
        {PROMPTS.map((p) => (
          <button key={p} type="button" className="tile chat__prompt" onClick={() => onPick(p)}>
            <Icon name="arrow" size={13} className="dim" />
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ route preview */

function RoutePreview() {
  const models = useStore((s) => s.models, shallowEqualArray)
  const activeId = useStore((s) => s.activeModel)
  const mode = useStore((s) => s.settings.routerMode)
  const active = models.find((m) => m.id === activeId) ?? models[0]
  const status = modelStatus(active)

  return (
    <span className="composer__route" data-model={active.id}>
      <span className="dot" data-s={status} />
      <span className="label">
        {mode === 'auto' ? 'Auto → ' : 'Pinned · '}
        {MODEL_NAME[active.id]}
      </span>
      {!active.local ? (
        <span className="composer__route-tokens num">{compact(active.tokens)}</span>
      ) : (
        <span className="composer__route-tokens num">∞</span>
      )}
    </span>
  )
}

/* -------------------------------------------------------------- demo menu */

export function DemoMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)
  const activeId = useStore((s) => s.activeModel)
  const streaming = useStore((s) => s.settings.streamResponses)

  return (
    <div className="demo" ref={ref}>
      <button
        type="button"
        className="btn btn--sm demo__btn"
        data-on={open || undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="flask" size={13} />
        Demo
      </button>
      {open ? (
        <div className="demo__pop panel">
          <span className="label demo__title">Simulation controls</span>
          <p className="demo__note">
            No requests leave the browser. These controls move the mock token budgets so the
            fallback can be exercised on demand.
          </p>
          <button
            type="button"
            className="demo__item"
            onClick={() => {
              drainModel(activeId)
              setOpen(false)
            }}
          >
            <Icon name="bolt" size={14} />
            <span className="grow">Simulate token exhaustion</span>
            <span className="label">{MODEL_NAME[activeId]}</span>
          </button>
          <button
            type="button"
            className="demo__item"
            onClick={() => {
              partialBudget(activeId)
              setOpen(false)
            }}
          >
            <Icon name="activity" size={14} />
            <span className="grow">Run out mid-answer</span>
            <span className="label">Partial</span>
          </button>
          <button
            type="button"
            className="demo__item"
            onClick={() => {
              refillModels()
              setOpen(false)
            }}
          >
            <Icon name="refresh" size={14} />
            <span className="grow">Restore token budgets</span>
          </button>
          <hr className="hair" />
          <button
            type="button"
            className="demo__item"
            onClick={() => updateSettings({ streamResponses: !streaming })}
          >
            <Icon name={streaming ? 'check' : 'close'} size={14} />
            <span className="grow">Stream responses</span>
            <span className="label">{streaming ? 'on' : 'off'}</span>
          </button>
          <button
            type="button"
            className="demo__item"
            onClick={() => {
              emit({ type: 'toast', text: 'Open Settings › Data to reset the demo' })
              navigate('settings')
              setOpen(false)
            }}
          >
            <Icon name="database" size={14} />
            <span className="grow">Reset demo data</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------ context rail */

function ContextRail({ conv }: { conv: Conversation }) {
  const models = useStore((s) => s.models, shallowEqualArray)
  const memories = useStore((s) => s.memories)
  const priority = useStore((s) => s.settings.priority, shallowEqualArray)

  const used = useMemo(() => {
    const ids = new Set<string>()
    for (const m of conv.messages) for (const id of m.context ?? []) ids.add(id)
    return [...ids].map((id) => memories.find((m) => m.id === id)).filter((m): m is Memory => Boolean(m))
  }, [conv, memories])

  const modelsUsed = useMemo(() => {
    const ids = new Set(conv.messages.map((m) => m.model).filter(Boolean))
    return [...ids] as Array<NonNullable<Message['model']>>
  }, [conv])

  return (
    <aside className="ctx-rail">
      <section className="ctx-rail__block">
        <span className="label">Budgets</span>
        <div className="ctx-rail__models">
          {priority.map((id) => {
            const m = models.find((x) => x.id === id)
            if (!m) return null
            const ratio = m.local ? 1 : m.tokens / m.tokensTotal
            return (
              <div key={id} className="budget" data-model={id}>
                <div className="budget__top">
                  <ModelMark id={id} size={18} />
                  <span className="budget__name grow">{m.name}</span>
                  <span className="budget__num num">
                    {m.local ? '∞' : <Counter value={m.tokens} compactAt={10000} />}
                  </span>
                </div>
                <Meter value={m.local ? 1 : 1 - ratio} segments={16} size="sm" tone={m.local ? 'model' : 'auto'} />
                {!m.local && m.tokens <= 0 ? <span className="budget__flag">Limit reached</span> : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="ctx-rail__block">
        <span className="label">Models in this thread</span>
        <div className="ctx-rail__chips">
          {modelsUsed.length === 0 ? <span className="dim">None yet</span> : null}
          {modelsUsed.map((id) => (
            <span key={id} className="chip chip--model" data-model={id}>
              <ModelMark id={id} size={14} />
              {MODEL_NAME[id]}
            </span>
          ))}
        </div>
      </section>

      <section className="ctx-rail__block grow">
        <span className="label">Memory in play</span>
        <div className="ctx-rail__mem scroll">
          {used.length === 0 ? (
            <p className="dim ctx-rail__hint">
              Memories injected into this conversation will be listed here with their id.
            </p>
          ) : null}
          {used.map((m) => (
            <button key={m.id} type="button" className="ctx-mem" onClick={() => navigate('memory', m.id)}>
              <span className="ctx-mem__id mono">#{m.id}</span>
              <span className="grow">{m.title}</span>
              <span className="ctx-mem__conf num">{Math.round(m.confidence * 100)}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  )
}
