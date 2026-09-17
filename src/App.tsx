import { useEffect, useRef } from 'react'
import { Shell } from './components/Shell'
import { CommandPalette } from './components/CommandPalette'
import { Toasts } from './components/Toasts'
import { Shortcuts } from './components/Shortcuts'
import { HomeView } from './views/HomeView'
import { ChatView } from './views/ChatView'
import { MemoryView } from './views/MemoryView'
import { ModelsView } from './views/ModelsView'
import { ProjectsView } from './views/ProjectsView'
import { ActivityView } from './views/ActivityView'
import { SettingsView } from './views/SettingsView'
import { navigate, useRoute } from './lib/router'
import { applyAppearance, emit, useStore } from './lib/store'
import { newConversation } from './lib/engine'
import { isTypingTarget } from './lib/hooks'
import type { ViewName } from './lib/types'

const GOTO: Record<string, ViewName> = {
  h: 'home',
  c: 'chat',
  m: 'memory',
  d: 'models',
  p: 'projects',
  a: 'activity',
  s: 'settings',
}

export function App() {
  const route = useRoute()
  const theme = useStore((s) => s.settings.theme)
  const motion = useStore((s) => s.settings.motion)
  const chord = useRef(0)

  // Follow the system settings while theme or motion are set to auto.
  useEffect(() => {
    applyAppearance()
    const watch: MediaQueryList[] = []
    if (theme === 'auto') watch.push(window.matchMedia('(prefers-color-scheme: light)'))
    if (motion === 'auto') watch.push(window.matchMedia('(prefers-reduced-motion: reduce)'))
    for (const mq of watch) mq.addEventListener('change', applyAppearance)
    return () => {
      for (const mq of watch) mq.removeEventListener('change', applyAppearance)
    }
  }, [theme, motion])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const k = e.key.toLowerCase()

      if ((e.metaKey || e.ctrlKey) && k === 'n') {
        e.preventDefault()
        newConversation()
        navigate('chat')
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (k === 'g') {
        chord.current = Date.now()
        return
      }
      if (Date.now() - chord.current < 1400 && GOTO[k]) {
        e.preventDefault()
        chord.current = 0
        navigate(GOTO[k])
        return
      }
      if (k === '/') {
        e.preventDefault()
        navigate('chat')
        requestAnimationFrame(() => emit({ type: 'focus-composer' }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Shell view={route.view}>
        {route.view === 'home' && <HomeView />}
        {route.view === 'chat' && <ChatView />}
        {route.view === 'memory' && <MemoryView focus={route.param} />}
        {route.view === 'models' && <ModelsView />}
        {route.view === 'projects' && <ProjectsView focus={route.param} />}
        {route.view === 'activity' && <ActivityView />}
        {route.view === 'settings' && <SettingsView section={route.param} />}
      </Shell>
      <CommandPalette />
      <Shortcuts />
      <Toasts />
    </>
  )
}
