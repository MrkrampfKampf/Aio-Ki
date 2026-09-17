import { useMemo, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { ModelMark, Segmented } from '../components/primitives'
import { useStore } from '../lib/store'
import { MODEL_NAME } from '../lib/mockData'
import { clock, dayKey } from '../lib/format'
import type { ActivityEvent, ActivityKind } from '../lib/types'

const ICON: Record<ActivityKind, IconName> = {
  response: 'chat',
  memory: 'memory',
  limit: 'bolt',
  route: 'branch',
  sync: 'refresh',
  connect: 'link',
  project: 'projects',
  system: 'settings',
}

const TONE: Partial<Record<ActivityKind, string>> = {
  limit: 'warn',
  route: 'accent',
  memory: 'ok',
}

type Filter = 'all' | 'response' | 'memory' | 'route' | 'sync'

export function ActivityView() {
  const activity = useStore((s) => s.activity)
  const [filter, setFilter] = useState<Filter>('all')

  const groups = useMemo(() => {
    const items = activity
      .filter((e) => (filter === 'all' ? true : filter === 'route' ? e.kind === 'route' || e.kind === 'limit' : e.kind === filter))
      .slice(0, 160)
    const out: Array<[string, ActivityEvent[]]> = []
    for (const e of items) {
      const key = dayKey(e.at)
      const last = out[out.length - 1]
      if (last && last[0] === key) last[1].push(e)
      else out.push([key, [e]])
    }
    return out
  }, [activity, filter])

  const today = activity.filter((e) => dayKey(e.at) === 'Today')

  return (
    <div className="view activity">
      <header className="activity__head">
        <div>
          <span className="label">Activity</span>
          <h2>Everything the system did</h2>
          <p className="dim">
            {today.length} events today · {activity.length} retained
          </p>
        </div>
        <Segmented
          value={filter}
          size="sm"
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'response', label: 'Responses' },
            { value: 'memory', label: 'Memory' },
            { value: 'route', label: 'Routing' },
            { value: 'sync', label: 'Sync' },
          ]}
        />
      </header>

      <div className="timeline">
        {groups.map(([day, items]) => (
          <section key={day} className="timeline__day">
            <div className="timeline__day-head">
              <span className="label">{day}</span>
              <span className="timeline__rule" />
              <span className="label">{items.length}</span>
            </div>
            <ol className="timeline__list">
              {items.map((e, i) => (
                <li
                  key={e.id}
                  className="event rise"
                  data-kind={e.kind}
                  data-tone={TONE[e.kind]}
                  data-model={e.model}
                  style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
                >
                  <span className="event__time num">{clock(e.at)}</span>
                  <span className="event__spine" aria-hidden="true">
                    <span className="event__node">
                      <Icon name={ICON[e.kind]} size={11} />
                    </span>
                  </span>
                  <span className="event__body">
                    <b>{e.title}</b>
                    {e.detail ? <em>{e.detail}</em> : null}
                  </span>
                  {e.model ? (
                    <span className="event__model">
                      <ModelMark id={e.model} size={18} />
                      <span className="label">{MODEL_NAME[e.model]}</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ))}
        {groups.length === 0 ? <p className="dim">No events match that filter.</p> : null}
      </div>
    </div>
  )
}
