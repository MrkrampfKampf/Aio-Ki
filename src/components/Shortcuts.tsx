import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { isTypingTarget } from '../lib/hooks'
import { useBus } from '../lib/store'

const GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    'Global',
    [
      ['⌘ K', 'Command palette'],
      ['⌘ N', 'New conversation'],
      ['?', 'This sheet'],
      ['Esc', 'Close whatever is open'],
    ],
  ],
  [
    'Navigate',
    [
      ['G then H', 'Home'],
      ['G then C', 'Chat'],
      ['G then M', 'Memory'],
      ['G then D', 'Models'],
      ['G then P', 'Projects'],
      ['G then A', 'Activity'],
      ['G then S', 'Settings'],
    ],
  ],
  [
    'Chat',
    [
      ['/', 'Jump to the composer'],
      ['Enter', 'Send'],
      ['Shift Enter', 'New line'],
    ],
  ],
]

export function Shortcuts() {
  const [open, setOpen] = useState(false)

  useBus((e) => {
    if (e.type === 'shortcuts') setOpen((v) => !v)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false)
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="modal__scrim" onClick={() => setOpen(false)} />
      <div className="modal__panel panel shortcuts">
        <header className="modal__head">
          <span className="cmdk__icon">
            <Icon name="command" size={14} />
          </span>
          <div className="grow">
            <span className="label">Keyboard</span>
            <h3>Shortcuts</h3>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="shortcuts__body">
          {GROUPS.map(([group, rows]) => (
            <section key={group}>
              <span className="label">{group}</span>
              <dl>
                {rows.map(([keys, what]) => (
                  <div key={keys}>
                    <dt>
                      {keys.split(' ').map((k, i) =>
                        k === 'then' ? (
                          <span key={i} className="shortcuts__then">
                            then
                          </span>
                        ) : (
                          <kbd key={i} className="keycap">
                            {k}
                          </kbd>
                        ),
                      )}
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
