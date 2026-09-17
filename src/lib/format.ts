const NUM = new Intl.NumberFormat('en-US')

export const fmt = (n: number): string => NUM.format(Math.round(n))

/** 12,740 → "12.7k" — used where the exact figure would crowd the layout. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 1 : 1)}k`
  return String(Math.round(n))
}

const CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const CLOCK_S = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
const DATE_FULL = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export const clock = (t: number): string => CLOCK.format(t)
export const clockS = (t: number): string => CLOCK_S.format(t)
export const dateShort = (t: number): string => DATE.format(t)
export const dateFull = (t: number): string => DATE_FULL.format(t)

export function ago(t: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - t) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return dateShort(t)
}

/** "Today, 14:32" / "Yesterday, 09:14" / "04 Mar, 21:02" */
export function stamp(t: number): string {
  const d = new Date(t)
  const today = new Date()
  const same = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (same(d, today)) return `Today, ${clock(t)}`
  if (same(d, yesterday)) return `Yesterday, ${clock(t)}`
  return `${dateShort(t)}, ${clock(t)}`
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Good night'
}

export function dayKey(t: number): string {
  const d = new Date(t)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const same = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return DATE_FULL.format(t)
}
