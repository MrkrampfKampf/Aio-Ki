import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { AppState, Settings } from './types'
import { initialState } from './mockData'

const STATE_KEY = 'aio.state.v1'
const SETTINGS_KEY = 'aio.settings.v1'

/* ------------------------------------------------------------------ store */

let state: AppState = hydrate()
const listeners = new Set<() => void>()

export function getState(): AppState {
  return state
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let saveTimer: number | undefined

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  for (const fn of listeners) fn()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(persist, 400)
}

/* -------------------------------------------------------------- hydration */

function hydrate(): AppState {
  const fresh = initialState()
  if (typeof localStorage === 'undefined') return fresh
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return fresh
    const saved = JSON.parse(raw) as Partial<AppState>
    const merged: AppState = {
      ...fresh,
      ...saved,
      // Entities are structural, never user data — always take the current shape.
      entities: fresh.entities,
      settings: { ...fresh.settings, ...(saved.settings ?? {}) },
    }
    return rollForward(merged)
  } catch {
    return fresh
  }
}

/**
 * Demo timestamps are seeded relative to first run. If the tab is opened days
 * later the whole system would look abandoned, so the timeline is shifted
 * forward as a block — relative spacing, and therefore the story, is preserved.
 */
function rollForward(s: AppState): AppState {
  const newest = Math.max(
    s.lastSync,
    ...s.activity.map((a) => a.at),
    ...s.conversations.map((c) => c.updatedAt),
  )
  const drift = Date.now() - newest
  if (drift < 6 * 3600_000) return s
  const shift = drift - 3 * 60_000 // land the newest event ~3 minutes ago
  return {
    ...s,
    lastSync: s.lastSync + shift,
    activity: s.activity.map((a) => ({ ...a, at: a.at + shift })),
    conversations: s.conversations.map((c) => ({
      ...c,
      createdAt: c.createdAt + shift,
      updatedAt: c.updatedAt + shift,
      messages: c.messages.map((m) => ({ ...m, at: m.at + shift })),
    })),
    projects: s.projects.map((p) => ({ ...p, lastActivity: p.lastActivity + shift })),
    memories: s.memories.map((m) => ({
      ...m,
      createdAt: m.createdAt + shift,
      lastUsedAt: m.lastUsedAt + shift,
    })),
  }
}

function persist(): void {
  try {
    const { syncing: _syncing, ...rest } = state
    // Never persist a half-streamed message — it would resume as a frozen answer.
    const clean: AppState = {
      ...(rest as AppState),
      syncing: false,
      conversations: state.conversations.map((c) => ({
        ...c,
        messages: c.messages.filter((m) => !m.streaming),
      })),
    }
    localStorage.setItem(STATE_KEY, JSON.stringify(clean))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings))
  } catch {
    /* storage full or blocked — the demo keeps working in memory */
  }
}

export function resetAll(): void {
  try {
    localStorage.removeItem(STATE_KEY)
    localStorage.removeItem(SETTINGS_KEY)
  } catch {
    /* ignore */
  }
  state = initialState()
  for (const fn of listeners) fn()
  persist()
}

/* ------------------------------------------------------------------ hooks */

export function useStore<T>(
  selector: (s: AppState) => T,
  equals: (a: T, b: T) => boolean = Object.is,
): T {
  const cache = useRef<{ v: T; filled: boolean }>({ v: undefined as unknown as T, filled: false })
  const get = useCallback(() => {
    const next = selector(state)
    if (!cache.current.filled || !equals(cache.current.v, next)) {
      cache.current = { v: next, filled: true }
    }
    return cache.current.v
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, equals])
  return useSyncExternalStore(subscribe, get, get)
}

export function shallowEqualArray<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
  return true
}

/* ------------------------------------------------------------- event bus */

type BusEvent =
  | { type: 'handoff'; from: string; to: string }
  | { type: 'memory'; id: string; title: string }
  | { type: 'sync' }
  | { type: 'toast'; text: string; tone?: 'ok' | 'warn' | 'crit' }
  | { type: 'palette' }
  | { type: 'shortcuts' }
  | { type: 'focus-composer' }

const busListeners = new Set<(e: BusEvent) => void>()

export function emit(e: BusEvent): void {
  for (const fn of busListeners) fn(e)
}

export function useBus(handler: (e: BusEvent) => void): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const fn = (e: BusEvent) => ref.current(e)
    busListeners.add(fn)
    return () => {
      busListeners.delete(fn)
    }
  }, [])
}

/* --------------------------------------------------------------- settings */

export function updateSettings(patch: Partial<Settings>): void {
  setState((s) => ({ settings: { ...s.settings, ...patch } }))
  applyAppearance()
}

/** True when transitions, streaming and spring counters should be skipped. */
export function reducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduced'
}

export function applyAppearance(): void {
  const { theme, accent, grain, motion } = state.settings
  const root = document.documentElement
  const resolved =
    theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme
  root.dataset.theme = resolved
  root.dataset.accent = accent
  root.dataset.grain = grain ? 'on' : 'off'
  root.dataset.motion =
    motion === 'auto'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'reduced'
        : 'full'
      : motion
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#dfe4ec' : '#08090c')
}
