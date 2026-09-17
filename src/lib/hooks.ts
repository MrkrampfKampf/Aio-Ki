import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from './store'

/** Eases a number toward its target with a critically-damped spring. */
export function useSpringNumber(target: number, stiffness = 0.16, snap = 0.5): number {
  const [value, setValue] = useState(target)
  const raf = useRef(0)
  const cur = useRef(target)

  useEffect(() => {
    if (reducedMotion()) {
      cur.current = target
      setValue(target)
      return
    }
    const step = () => {
      const delta = target - cur.current
      if (Math.abs(delta) < snap) {
        cur.current = target
        setValue(target)
        return
      }
      cur.current += delta * stiffness
      setValue(cur.current)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, stiffness, snap])

  return value
}

export function useNow(interval = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(id)
  }, [interval])
  return now
}

export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  onOutside: () => void,
  active = true,
): void {
  const cb = useRef(onOutside)
  cb.current = onOutside
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current()
    }
    // Defer so the click that opened the surface does not immediately close it.
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [ref, active])
}

export function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable
}
