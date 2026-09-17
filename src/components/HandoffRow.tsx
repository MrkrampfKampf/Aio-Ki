import { useEffect, useState } from 'react'
import { ModelMark } from './primitives'
import { Icon } from './Icon'
import { MODEL_NAME } from '../lib/mockData'
import { reducedMotion } from '../lib/store'
import type { Handoff } from '../lib/types'

/**
 * The router handoff as it appears inside the transcript. Fresh handoffs play
 * through three stages so the switch reads as a decision rather than an error;
 * historical rows render straight to the final state.
 */
export function HandoffRow({ handoff, at }: { handoff: Handoff; at: number }) {
  const fresh = Date.now() - at < 4000
  const [stage, setStage] = useState(fresh ? 0 : 2)

  useEffect(() => {
    if (!fresh) return
    const reduced = reducedMotion()
    const a = window.setTimeout(() => setStage(1), reduced ? 60 : 620)
    const b = window.setTimeout(() => setStage(2), reduced ? 120 : 1320)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [fresh])

  return (
    <div className="handoff" data-stage={stage} role="status">
      <span className="handoff__rule" />
      <div className="handoff__body">
        <div className="handoff__step" data-on={stage >= 0 || undefined}>
          <ModelMark id={handoff.from} size={22} />
          <span className="handoff__text">
            <b>{MODEL_NAME[handoff.from]} unavailable</b>
            <em>{handoff.reason}</em>
          </span>
        </div>

        <div className="handoff__link" data-on={stage >= 1 || undefined}>
          <span className="handoff__line" />
          <span className="label">
            {stage >= 2 ? 'Context carried over' : 'Switching model'}
            {stage < 2 ? <span className="handoff__ellipsis">…</span> : null}
          </span>
          <span className="handoff__line" />
        </div>

        <div className="handoff__step" data-on={stage >= 2 || undefined}>
          <ModelMark id={handoff.to} size={22} />
          <span className="handoff__text">
            <b>{MODEL_NAME[handoff.to]}</b>
            <em className="row gap-6">
              <span className="dot" data-s="connected" /> Connected · continuing
            </em>
          </span>
          {stage >= 2 ? <Icon name="check" size={13} className="handoff__ok" /> : null}
        </div>
      </div>
      <span className="handoff__rule" />
    </div>
  )
}
