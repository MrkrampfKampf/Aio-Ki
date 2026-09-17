import { useEffect, useState } from 'react'
import type { ViewName } from './types'

export const VIEWS: ViewName[] = [
  'home',
  'chat',
  'memory',
  'models',
  'projects',
  'activity',
  'settings',
]

export interface Route {
  view: ViewName
  param?: string
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function parse(pathname: string): Route {
  let path = pathname
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length)
  const parts = path.split('/').filter(Boolean)
  const view = parts[0] as ViewName | undefined
  if (!view || !VIEWS.includes(view)) return { view: 'home' }
  return { view, param: parts[1] ? decodeURIComponent(parts[1]) : undefined }
}

function href(view: ViewName, param?: string): string {
  const tail = param ? `/${encodeURIComponent(param)}` : ''
  return `${BASE}/${view === 'home' && !param ? '' : view + tail}` || '/'
}

const subs = new Set<() => void>()
let current: Route = typeof location !== 'undefined' ? parse(location.pathname) : { view: 'home' }

export function navigate(view: ViewName, param?: string, replace = false): void {
  const next = { view, param }
  if (next.view === current.view && next.param === current.param) return
  current = next
  const url = href(view, param)
  if (replace) history.replaceState({}, '', url)
  else history.pushState({}, '', url)
  for (const fn of subs) fn()
}

export function linkTo(view: ViewName, param?: string): string {
  return href(view, param)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    current = parse(location.pathname)
    for (const fn of subs) fn()
  })
}

export function useRoute(): Route {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const fn = () => setRoute(current)
    subs.add(fn)
    fn()
    return () => {
      subs.delete(fn)
    }
  }, [])
  return route
}

