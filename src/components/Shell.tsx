import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavRail } from './NavRail'
import { StatusBar } from './StatusBar'
import type { ViewName } from '../lib/types'

export function Shell({ view, children }: { view: ViewName; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const stage = useRef<HTMLDivElement>(null)

  // Each view enters from the top of its own scroll position.
  useEffect(() => {
    stage.current?.scrollTo({ top: 0 })
  }, [view])

  return (
    <div className="room">
      <div className="chassis">
        <NavRail active={view} open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="scrim" data-on={navOpen || undefined} onClick={() => setNavOpen(false)} />
        <main className="stage">
          <StatusBar view={view} onMenu={() => setNavOpen(true)} />
          <div className="stage__body" key={view} ref={stage}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
