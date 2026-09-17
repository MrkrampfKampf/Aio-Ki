import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Entity, Memory } from '../lib/types'

interface Node {
  id: string
  label: string
  note?: string
  parent: string | null
  depth: number
  count: number
  r: number
  x: number
  y: number
  vx: number
  vy: number
}

/**
 * A small deterministic force layout. Runs once per entity set — no ticking
 * simulation, so the graph is stable, cheap and identical on every load.
 */
function layout(entities: Entity[], counts: Record<string, number>): Node[] {
  const depthOf = (id: string, seen = 0): number => {
    const e = entities.find((x) => x.id === id)
    if (!e || !e.parent || seen > 8) return 0
    return 1 + depthOf(e.parent, seen + 1)
  }

  const nodes: Node[] = entities.map((e, i) => {
    const depth = depthOf(e.id)
    const a = (i / entities.length) * Math.PI * 2 + depth
    const rad = depth * 128
    const count = counts[e.id] ?? 0
    return {
      id: e.id,
      label: e.label,
      note: e.note,
      parent: e.parent,
      depth,
      count,
      r: 10 + Math.min(17, Math.sqrt(count) * 3.2),
      x: Math.cos(a) * rad,
      y: Math.sin(a) * rad,
      vx: 0,
      vy: 0,
    }
  })

  const index = new Map(nodes.map((n) => [n.id, n]))

  for (let step = 0; step < 460; step++) {
    const cool = 1 - step / 520
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          dx = (i - j) * 0.7
          dy = (j - i) * 0.5
          d2 = 1
        }
        const d = Math.sqrt(d2)
        const force = (9600 + (a.r + b.r) * 190) / d2
        const fx = (dx / d) * force
        const fy = (dy / d) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    for (const n of nodes) {
      if (!n.parent) continue
      const p = index.get(n.parent)
      if (!p) continue
      const dx = p.x - n.x
      const dy = p.y - n.y
      const d = Math.hypot(dx, dy) || 1
      const target = 118 + n.depth * 14 + n.r
      const pull = (d - target) * 0.052
      const fx = (dx / d) * pull
      const fy = (dy / d) * pull
      n.vx += fx
      n.vy += fy
      p.vx -= fx * 0.42
      p.vy -= fy * 0.42
    }

    for (const n of nodes) {
      n.vx -= n.x * 0.0045
      n.vy -= n.y * 0.0045
      n.x += n.vx * 0.5 * cool
      n.y += n.vy * 0.5 * cool
      n.vx *= 0.72
      n.vy *= 0.72
      if (!n.parent) {
        n.x *= 0.5
        n.y *= 0.5
      }
    }
  }

  return nodes
}

interface Props {
  entities: Entity[]
  memories: Memory[]
  selected: string | null
  onSelect: (id: string | null) => void
  onOpenMemory: (id: string) => void
}

export function MemoryGraph({ entities, memories, selected, onSelect, onOpenMemory }: Props) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const m of memories) if (!m.forgotten) c[m.entity] = (c[m.entity] ?? 0) + 1
    return c
  }, [memories])

  const base = useMemo(() => layout(entities, counts), [entities, counts])
  const [drag, setDrag] = useState<Record<string, { x: number; y: number }>>({})
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const svg = useRef<SVGSVGElement>(null)
  const pointer = useRef<{ id: string | null; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [pxWidth, setPxWidth] = useState(880)

  // The viewBox is sized to the layout, so text would shrink as the graph grows.
  // Measuring the rendered width lets labels keep a constant apparent size.
  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    const measure = () => setPxWidth(el.getBoundingClientRect().width || 880)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nodes = useMemo(
    () => base.map((n) => ({ ...n, ...(drag[n.id] ?? {}) })),
    [base, drag],
  )
  const index = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  const bounds = useMemo(() => {
    const pad = 132
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [nodes])

  const family = useMemo(() => {
    const target = hover ?? selected
    if (!target) return null
    const set = new Set<string>([target])
    let changed = true
    while (changed) {
      changed = false
      for (const n of nodes) {
        if (n.parent && set.has(n.parent) && !set.has(n.id)) {
          set.add(n.id)
          changed = true
        }
      }
    }
    let cur = index.get(target)?.parent
    let guard = 0
    while (cur && guard++ < 8) {
      set.add(cur)
      cur = index.get(cur)?.parent ?? null
    }
    return set
  }, [hover, selected, nodes, index])

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const el = svg.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const scale = bounds.w / rect.width / view.z
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    }
  }, [bounds.w, view.z])

  const onPointerDown = (e: React.PointerEvent, id: string | null) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const local = toLocal(e.clientX, e.clientY)
    const node = id ? index.get(id) : null
    pointer.current = {
      id,
      sx: local.x,
      sy: local.y,
      ox: node ? node.x : view.x,
      oy: node ? node.y : view.y,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p) return
    const local = toLocal(e.clientX, e.clientY)
    const dx = local.x - p.sx
    const dy = local.y - p.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true
    if (p.id) setDrag((d) => ({ ...d, [p.id as string]: { x: p.ox + dx, y: p.oy + dy } }))
    else setView((v) => ({ ...v, x: p.ox + dx, y: p.oy + dy }))
  }

  const onPointerUp = (id: string | null) => {
    const p = pointer.current
    pointer.current = null
    if (!p || p.moved) return
    onSelect(id === selected ? null : id)
  }

  const satellites = useMemo(() => {
    if (!selected) return []
    const own = memories.filter((m) => m.entity === selected && !m.forgotten).slice(0, 10)
    const node = index.get(selected)
    if (!node) return []
    return own.map((m, i) => {
      const a = (i / Math.max(own.length, 1)) * Math.PI * 2 - Math.PI / 2
      const rad = node.r + 44
      return { m, x: node.x + Math.cos(a) * rad, y: node.y + Math.sin(a) * rad }
    })
  }, [selected, memories, index])

  const scale = bounds.w / Math.max(pxWidth, 1)

  return (
    <div className="graph">
      <svg
        ref={svg}
        className="graph__svg"
        style={{ '--gs': (bounds.w / Math.max(pxWidth, 1)).toFixed(3) } as React.CSSProperties}
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
        onPointerDown={(e) => onPointerDown(e, null)}
        onPointerMove={onPointerMove}
        onPointerUp={() => onPointerUp(null)}
        onPointerLeave={() => {
          pointer.current = null
          setHover(null)
        }}
        role="application"
        aria-label="Memory knowledge graph"
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
          <g className="graph__links">
            {nodes.map((n) => {
              const p = n.parent ? index.get(n.parent) : null
              if (!p) return null
              const mx = (n.x + p.x) / 2
              const my = (n.y + p.y) / 2
              const lit = family ? family.has(n.id) && family.has(p.id) : false
              return (
                <path
                  key={`l-${n.id}`}
                  d={`M${p.x} ${p.y} Q ${mx + (n.y - p.y) * 0.12} ${my - (n.x - p.x) * 0.12} ${n.x} ${n.y}`}
                  className="graph__link"
                  data-lit={lit || undefined}
                  data-dim={family && !lit ? true : undefined}
                />
              )
            })}
          </g>

          {satellites.map(({ m, x, y }) => {
            const node = index.get(selected!)!
            return (
              <g key={`s-${m.id}`} className="graph__sat" onPointerDown={(e) => e.stopPropagation()}>
                <line x1={node.x} y1={node.y} x2={x} y2={y} className="graph__sat-link" />
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  className="graph__sat-dot"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenMemory(m.id)
                  }}
                />
                <text x={x} y={y - 9 * scale} className="graph__sat-label">
                  #{m.id}
                </text>
              </g>
            )
          })}

          {nodes.map((n) => {
            const dim = family ? !family.has(n.id) : false
            const isSel = selected === n.id
            return (
              <g
                key={n.id}
                className="graph__node"
                data-sel={isSel || undefined}
                data-dim={dim || undefined}
                data-root={!n.parent || undefined}
                transform={`translate(${n.x} ${n.y})`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onPointerDown(e, n.id)
                }}
                onPointerUp={(e) => {
                  e.stopPropagation()
                  onPointerUp(n.id)
                }}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
              >
                <circle r={n.r + 11} className="graph__halo" />
                <circle r={n.r} className="graph__disc" />
                <circle r={n.r} className="graph__ring" />
                <text y={n.r + 13 * scale} className="graph__label">
                  {n.label}
                </text>
                {n.count > 0 ? (
                  <text y={n.r + 25 * scale} className="graph__count">
                    {n.count}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="graph__zoom">
        <button type="button" className="btn btn--sm" onClick={() => setView((v) => ({ ...v, z: Math.min(2.4, v.z + 0.22) }))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="btn btn--sm" onClick={() => setView((v) => ({ ...v, z: Math.max(0.55, v.z - 0.22) }))} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setView({ x: 0, y: 0, z: 1 })
            setDrag({})
          }}
        >
          Reset
        </button>
      </div>
      <p className="graph__hint label">Drag nodes · click to expand memories</p>
    </div>
  )
}
