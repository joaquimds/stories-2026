import { Link } from '@tanstack/react-router'
import {
  type SimulationNodeDatum,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapFragment, MapGraph } from '../server/data/map.ts'
import { getMapParents } from '../server/fns/stories.ts'
import { ROOT_NAME } from '../lib/site.ts'
import { ROOT_ID, storyParam } from '../domain/thread.ts'
import { last, present } from '../domain/present.ts'
import styles from './StoryMap.module.css'

// The length links settle at
const SPACING = 110
const POPOVER_WIDTH = 280
// Room around the map when framing it
const FRAME_MARGIN = 60
// Until the map is measured in the browser
const DEFAULT_SIZE = { width: 700, height: 500 }
const GLIDE_MS = 450

// The map point at the centre of the view, and screen pixels per map unit
type Camera = { x: number; y: number; scale: number }

type Point = { x: number; y: number }

type Body = SimulationNodeDatum & { id: number }

// The story the map is showing: its sentences from the root, the
// permalink of the story up to each, and where each continuation of its
// last sentence leads
export type MapStory = {
  path: number[]
  prefixes: string[]
  extensions: Record<number, string>
}

// Everything loaded so far, one entry per sentence
type Graph = {
  fragments: Map<number, MapFragment>
  links: Map<string, { from: number; to: number }>
}

const linkKey = (from: number, to: number) => `${from}-${to}`

// Adds newly loaded sentences and links; the same graph back if nothing
// is new, so the layout only restarts when there is something to place
const merge = (graph: Graph, more: MapGraph): Graph => {
  const fresh =
    more.fragments.some((f) => !graph.fragments.has(f.id)) ||
    more.links.some((l) => !graph.links.has(linkKey(l.from, l.to)))
  if (!fresh) {
    return graph
  }
  const fragments = new Map(graph.fragments)
  for (const fragment of more.fragments) {
    fragments.set(fragment.id, fragment)
  }
  const links = new Map(graph.links)
  for (const link of more.links) {
    links.set(linkKey(link.from, link.to), link)
  }
  return { fragments, links }
}

const EMPTY: Graph = { fragments: new Map(), links: new Map() }

const clampScale = (scale: number) => Math.min(Math.max(scale, 0.1), 3)

// Zooms by `factor`, keeping the map point at `focus` where it is
const zoomed = (
  camera: Camera,
  factor: number,
  focus: Point = camera,
): Camera => {
  const scale = clampScale(camera.scale * factor)
  const keep = camera.scale / scale
  return {
    x: focus.x + (camera.x - focus.x) * keep,
    y: focus.y + (camera.y - focus.y) * keep,
    scale,
  }
}

// The map point under a screen position
const pointAt = (
  element: Element,
  clientX: number,
  clientY: number,
  camera: Camera,
): Point => {
  const box = element.getBoundingClientRect()
  return {
    x: camera.x + (clientX - box.left - box.width / 2) / camera.scale,
    y: camera.y + (clientY - box.top - box.height / 2) / camera.scale,
  }
}

// A camera showing every point, as large as the view allows
const framing = (
  points: Iterable<Point>,
  size: typeof DEFAULT_SIZE,
): Camera => {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  if (minX > maxX) {
    return { x: 0, y: 0, scale: 1 }
  }
  const scale = clampScale(
    Math.min(
      1,
      size.width / (maxX - minX + 2 * FRAME_MARGIN),
      size.height / (maxY - minY + 2 * FRAME_MARGIN),
    ),
  )
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale }
}

const round = (n: number) => Math.round(n * 100) / 100

// Where sentences not yet placed start. The first time, spreading out from
// `anchor` along the links, each in a slice of the circle sized by how many
// branch tips it leads to; afterwards, a little beyond a neighbour already
// placed. The physics then only has to settle them. Rounded so the server
// and the browser draw the same first frame.
const placeNew = (graph: Graph, placed: Map<number, Point>, anchor: number) => {
  const positions = new Map(placed)
  const after = new Map<number, number[]>()
  const before = new Map<number, number[]>()
  for (const { from, to } of graph.links.values()) {
    after.set(from, [...(after.get(from) ?? []), to])
    before.set(to, [...(before.get(to) ?? []), from])
  }

  if (!positions.size && graph.fragments.has(anchor)) {
    // A spanning tree from the anchor, found breadth first
    const children = new Map<number, number[]>()
    const seen = new Set([anchor])
    let level = [anchor]
    const depth = new Map([[anchor, 0]])
    while (level.length) {
      const next: number[] = []
      for (const id of level) {
        for (const to of after.get(id) ?? []) {
          if (!seen.has(to)) {
            seen.add(to)
            depth.set(to, (depth.get(id) ?? 0) + 1)
            children.set(id, [...(children.get(id) ?? []), to])
            next.push(to)
          }
        }
      }
      level = next
    }
    const tips = new Map<number, number>()
    const countTips = (id: number): number => {
      const below = children.get(id) ?? []
      const count = below.length
        ? below.reduce((sum, child) => sum + countTips(child), 0)
        : 1
      tips.set(id, count)
      return count
    }
    countTips(anchor)
    const place = (id: number, from: number, to: number) => {
      // A gentle turn at each step, so a long story curves rather than
      // lying in a straight line the physics can't push sideways
      const level = depth.get(id) ?? 0
      const angle = (from + to) / 2 + level * 0.35
      const radius = level * SPACING
      positions.set(id, {
        x: round(radius * Math.cos(angle)),
        y: round(radius * Math.sin(angle)),
      })
      let start = from
      for (const child of children.get(id) ?? []) {
        const span =
          ((to - from) * (tips.get(child) ?? 1)) / (tips.get(id) ?? 1)
        place(child, start, start + span)
        start += span
      }
    }
    place(anchor, -Math.PI / 2, (3 * Math.PI) / 2)
  }

  // Everything else, next to a placed neighbour: beyond it for something
  // that follows it, before it for something that leads in
  let waiting = [...graph.fragments.keys()].filter((id) => !positions.has(id))
  while (waiting.length) {
    const still: number[] = []
    for (const id of waiting) {
      const parent = (before.get(id) ?? []).find((n) => positions.has(n))
      const child = (after.get(id) ?? []).find((n) => positions.has(n))
      const neighbour = parent ?? child
      const at = neighbour === undefined ? undefined : positions.get(neighbour)
      if (!at) {
        still.push(id)
        continue
      }
      const length = Math.hypot(at.x, at.y)
      // Away from the middle, or a direction of its own at the middle
      const angle = length > 1 ? Math.atan2(at.y, at.x) : id
      const side = ((id % 5) - 2) * 0.35
      const sign = parent === undefined ? -1 : 1
      positions.set(id, {
        x: round(at.x + sign * SPACING * Math.cos(angle + side)),
        y: round(at.y + sign * SPACING * Math.sin(angle + side)),
      })
    }
    if (still.length === waiting.length) {
      for (const id of still) {
        positions.set(id, { x: 0, y: 0 })
      }
      break
    }
    waiting = still
  }
  return positions
}

// Runs the physics that lays out the map: sentences held to the ones they
// lead to by springs, pushed apart from each other, kept from overlapping,
// and drawn gently towards the middle. New sentences start next to their
// neighbours; those already placed stay where they are, so the map grows
// rather than changing shape.
const useForceLayout = (graph: Graph, anchor: number) => {
  const [positions, setPositions] = useState(() =>
    placeNew(graph, new Map(), anchor),
  )
  const latest = useRef({ graph, anchor, positions })
  useEffect(() => {
    latest.current = { graph, anchor, positions }
  })
  useEffect(() => {
    const { graph, anchor, positions: placed } = latest.current
    const start = placeNew(graph, placed, anchor)
    const settled = [...graph.fragments.keys()].every((id) => placed.has(id))
    const bodies: Body[] = [...graph.fragments.keys()].map((id) => ({
      id,
      ...(start.get(id) ?? { x: 0, y: 0 }),
    }))
    const links = [...graph.links.values()]
      .filter((l) => l.from !== l.to)
      .map((l) => ({ source: l.from, target: l.to }))
    const publish = () =>
      setPositions(
        new Map(bodies.map((b) => [b.id, { x: b.x ?? 0, y: b.y ?? 0 }])),
      )
    const simulation = forceSimulation(bodies)
      .force(
        'links',
        forceLink<Body, { source: number; target: number }>(links)
          .id((b) => b.id)
          .distance(SPACING)
          .strength(0.5),
      )
      .force('repel', forceManyBody<Body>().strength(-260))
      .force('collide', forceCollide<Body>(20))
      .force('x', forceX<Body>(0).strength(0.02))
      .force('y', forceY<Body>(0).strength(0.02))
      // Starting close to the end, with more damping, it eases into place
      .alpha(settled ? 0.05 : placed.size ? 0.25 : 0.5)
      .velocityDecay(0.6)
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    if (reduceMotion) {
      simulation.stop().tick(300)
      publish()
    } else {
      simulation.on('tick', publish)
    }
    return () => {
      simulation.stop()
    }
  }, [graph])
  return positions
}

// A link drawn as a tapering shape, wide where it leaves and narrow where
// it arrives, so a loop's direction shows; curved when two sentences link
// both ways. `inset` keeps it clear of the dots.
const taper = (
  a: Point,
  b: Point,
  widths: [number, number],
  bend: number,
  inset: number,
) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const normal = { x: -dy / length, y: dx / length }
  const control = {
    x: (a.x + b.x) / 2 + normal.x * bend,
    y: (a.y + b.y) / 2 + normal.y * bend,
  }
  const t0 = Math.min(inset / length, 0.45)
  const t1 = 1 - t0
  const steps = bend ? 12 : 1
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps
    const u = 1 - t
    const p = {
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
    }
    const d = {
      x: 2 * u * (control.x - a.x) + 2 * t * (b.x - control.x),
      y: 2 * u * (control.y - a.y) + 2 * t * (b.y - control.y),
    }
    const dl = Math.hypot(d.x, d.y) || 1
    const n = { x: -d.y / dl, y: d.x / dl }
    const half = (widths[0] + ((widths[1] - widths[0]) * i) / steps) / 2
    left.push(`${p.x + n.x * half} ${p.y + n.y * half}`)
    right.push(`${p.x - n.x * half} ${p.y - n.y * half}`)
  }
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`
}

// A sentence linking to itself, drawn as a small loop above it
const selfLoop = (a: Point, size: number) =>
  `M ${a.x} ${a.y} C ${a.x - size} ${a.y - size * 1.6} ${a.x + size} ${
    a.y - size * 1.6
  } ${a.x} ${a.y}`

const sentence = (fragment: MapFragment) =>
  fragment.id === ROOT_ID ? ROOT_NAME : fragment.content

// The graph around a story, which grows as you explore: a dot moves the map
// to its sentence and adds what lies beyond it (and, for the earliest
// sentence shown, what leads into it), and nothing already placed moves far.
// Panned by dragging and zoomed with the wheel or the buttons.
export const StoryMap = ({
  graph: loaded,
  story,
}: {
  graph: MapGraph
  story: MapStory
}) => {
  const [graph, setGraph] = useState(() => merge(EMPTY, loaded))
  // New data for the map arrives as you move around it
  const [lastLoaded, setLastLoaded] = useState(loaded)
  if (loaded !== lastLoaded) {
    setLastLoaded(loaded)
    setGraph((g) => merge(g, loaded))
  }

  const { path, prefixes, extensions } = story
  // The story is drawn from the earliest of its sentences loaded so far
  let first = path.length - 1
  while (first > 0 && graph.fragments.has(present(path[first - 1]))) {
    first--
  }
  const earliest = present(path[first])
  const current = last(path)
  const onStory = new Set(path.slice(first))
  const storyLinks = new Set(
    path.slice(first + 1).map((id, i) => linkKey(present(path[first + i]), id)),
  )

  const positions = useForceLayout(graph, earliest)
  const shownAfter = useMemo(() => {
    const counts = new Map<number, number>()
    for (const { from } of graph.links.values()) {
      counts.set(from, (counts.get(from) ?? 0) + 1)
    }
    return counts
  }, [graph])

  // Where a sentence leads: along the story if it is on it or continues
  // it, otherwise the story it was written in
  const target = (fragment: MapFragment) => {
    const index = path.lastIndexOf(fragment.id)
    return (
      (index >= 0 ? prefixes[index] : undefined) ??
      extensions[fragment.id] ??
      fragment.origin
    )
  }

  const [loadingAbove, setLoadingAbove] = useState(false)
  const loadAbove = async (id: number) => {
    if (loadingAbove) {
      return
    }
    setLoadingAbove(true)
    try {
      const more = await getMapParents({ data: { sentenceId: id } })
      setGraph((g) => merge(g, more))
    } finally {
      setLoadingAbove(false)
    }
  }

  const [size, setSize] = useState(DEFAULT_SIZE)
  // Follows the layout as it settles, until the reader moves around
  const [chosen, setChosen] = useState<Camera | null>(null)
  const camera = chosen ?? framing(positions.values(), size)
  const [hovered, setHovered] = useState<number | null>(null)
  const pointerType = useRef<string>('mouse')
  const pressing = useRef(false)
  const popoverLink = useRef<HTMLAnchorElement>(null)
  // The popover closes a moment after the pointer leaves, so it can be
  // reached from its dot
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = (id: number) => {
    clearTimeout(hideTimer.current)
    setHovered(id)
  }
  const hideSoon = () => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setHovered(null), 200)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])
  const svg = useRef<SVGSVGElement>(null)
  // The latest camera and layout, for listeners and animations
  const latest = useRef({ camera, positions })
  useEffect(() => {
    latest.current = { camera, positions }
  })
  const drag = useRef<{
    x: number
    y: number
    camera: Camera
    moved: boolean
  }>(null)

  // Glides to where you are when you move along the map
  const glide = useRef(0)
  const lastCurrent = useRef(current)
  useEffect(() => {
    if (lastCurrent.current === current) {
      return
    }
    lastCurrent.current = current
    const to = latest.current.positions.get(current)
    if (!to) {
      return
    }
    const from = latest.current.camera
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const started = performance.now()
    const step = (now: number) => {
      const t = reduceMotion ? 1 : Math.min(1, (now - started) / GLIDE_MS)
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      setChosen({
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
        scale: from.scale,
      })
      if (t < 1) {
        glide.current = requestAnimationFrame(step)
      }
    }
    cancelAnimationFrame(glide.current)
    glide.current = requestAnimationFrame(step)
  }, [current])
  useEffect(() => () => cancelAnimationFrame(glide.current), [])

  // Follows the map's size, and zooms with the wheel through a non-passive
  // listener so the page doesn't scroll instead
  useEffect(() => {
    const element = svg.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(element)
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      cancelAnimationFrame(glide.current)
      setChosen((c) => {
        const from = c ?? latest.current.camera
        return zoomed(
          from,
          Math.exp(-event.deltaY * 0.0015),
          pointAt(element, event.clientX, event.clientY, from),
        )
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', onWheel)
    }
  }, [])

  const zoom = (factor: number) => {
    cancelAnimationFrame(glide.current)
    setChosen(zoomed(camera, factor))
  }
  const width = size.width / camera.scale
  const height = size.height / camera.scale
  const viewBox = [
    camera.x - width / 2,
    camera.y - height / 2,
    width,
    height,
  ].join(' ')

  const dotClass = (fragment: MapFragment) =>
    [
      styles.dot,
      onStory.has(fragment.id) ? styles['dot-story'] : '',
      // The beginning green; the earliest of the story shown blue when the
      // map starts later than that
      fragment.id === ROOT_ID
        ? styles['dot-start']
        : fragment.id === earliest
          ? styles['dot-earliest']
          : '',
      // Tales' ends red
      fragment.continuations === 0 ? styles['dot-end'] : '',
    ].join(' ')

  // The popover sits above its dot, or below near the top, inside the map
  const popover = (() => {
    const fragment = hovered === null ? undefined : graph.fragments.get(hovered)
    const at = fragment ? positions.get(fragment.id) : undefined
    if (!fragment || !at) {
      return null
    }
    const x = (at.x - camera.x) * camera.scale + size.width / 2
    const y = (at.y - camera.y) * camera.scale + size.height / 2
    const half = Math.min(POPOVER_WIDTH, size.width - 16) / 2
    const above = y > 140
    return {
      fragment,
      more: fragment.continuations - (shownAfter.get(fragment.id) ?? 0),
      style: {
        left: Math.min(Math.max(x, half + 8), size.width - half - 8),
        top: above ? y - 16 : y + 16,
        maxWidth: half * 2,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      },
    }
  })()

  const px = 1 / camera.scale
  const fragments = [...graph.fragments.values()]

  return (
    <div className={styles.map}>
      <div className={styles.controls}>
        <button
          type="button"
          className="link"
          onClick={() => zoom(1.25)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="link"
          onClick={() => zoom(0.8)}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            cancelAnimationFrame(glide.current)
            setChosen(null)
          }}
        >
          reset
        </button>
      </div>
      <svg
        ref={svg}
        className={styles.canvas}
        viewBox={viewBox}
        role="img"
        aria-label="Map of the story's branches"
        aria-busy={loadingAbove}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            setHovered(null)
          }
          cancelAnimationFrame(glide.current)
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            camera,
            moved: false,
          }
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (!start) {
            return
          }
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (!start.moved && Math.hypot(dx, dy) < 4) {
            return
          }
          if (!start.moved) {
            start.moved = true
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          setChosen({
            ...start.camera,
            x: start.camera.x - dx / start.camera.scale,
            y: start.camera.y - dy / start.camera.scale,
          })
        }}
        onPointerUp={() => {
          // Leaves `moved` set until the click that ends a drag is ignored
          setTimeout(() => {
            drag.current = null
          })
        }}
        onClickCapture={(event) => {
          if (drag.current?.moved) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {[...graph.links.values()].map(({ from, to }) => {
          const a = positions.get(from)
          const b = positions.get(to)
          if (!a || !b) {
            return null
          }
          const key = linkKey(from, to)
          const story = storyLinks.has(key)
          const className = story ? styles['edge-story'] : styles.edge
          if (from === to) {
            return (
              <path
                key={key}
                d={selfLoop(a, 22 * px)}
                className={`${className} ${styles['edge-loop']}`}
              />
            )
          }
          const both = graph.links.has(linkKey(to, from))
          const length = Math.hypot(b.x - a.x, b.y - a.y)
          return (
            <path
              key={key}
              d={taper(
                a,
                b,
                story ? [6 * px, 1.5 * px] : [4 * px, 1 * px],
                both ? length * 0.2 : 0,
                7 * px,
              )}
              className={className}
            />
          )
        })}
        {fragments.map((fragment) => {
          const at = positions.get(fragment.id)
          if (!at) {
            return null
          }
          const id = fragment.id
          const loadsAbove = id === earliest && id !== ROOT_ID
          return (
            <g
              key={id}
              transform={`translate(${at.x} ${at.y})`}
              onPointerEnter={(event) => {
                // Touch has no hover: a first tap shows the sentence instead
                if (event.pointerType === 'mouse') {
                  show(id)
                }
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') {
                  hideSoon()
                }
              }}
              onPointerDown={(event) => {
                pointerType.current = event.pointerType
                pressing.current = true
              }}
              onFocus={() => {
                // Keyboard focus shows the sentence; a tap's focus waits
                // for the tap itself
                if (!pressing.current) {
                  show(id)
                }
              }}
              onBlur={hideSoon}
              onKeyDown={(event) => {
                // Tab moves from a dot to its sentence's link to the story
                if (
                  event.key === 'Tab' &&
                  !event.shiftKey &&
                  hovered === id &&
                  popoverLink.current
                ) {
                  event.preventDefault()
                  popoverLink.current.focus()
                }
              }}
            >
              {id === current ? (
                <circle r={10 * px} className={styles.ring} />
              ) : null}
              <circle r={5 * px} className={dotClass(fragment)} />
              <Link
                to="/map/$story"
                params={{ story: storyParam(target(fragment)) }}
                aria-label={sentence(fragment)}
                className={styles.target}
                onClick={(event) => {
                  pressing.current = false
                  // On touch screens, the first tap shows the sentence and
                  // a second acts on it
                  if (pointerType.current === 'touch' && hovered !== id) {
                    event.preventDefault()
                    show(id)
                    return
                  }
                  // Like any dot, it moves there; the earliest sentence shown
                  // also loads what leads into it
                  if (loadsAbove) {
                    void loadAbove(id)
                  }
                }}
              >
                {/* A wider target than the dot, for fingers */}
                <circle r={14 * px} />
              </Link>
            </g>
          )
        })}
      </svg>
      {popover ? (
        <div
          className={styles.popover}
          role="tooltip"
          style={popover.style}
          onPointerEnter={() => clearTimeout(hideTimer.current)}
          onFocus={() => clearTimeout(hideTimer.current)}
          onBlur={hideSoon}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') {
              hideSoon()
            }
          }}
        >
          <Link ref={popoverLink} to={target(popover.fragment)}>
            {sentence(popover.fragment)}
          </Link>
          {popover.more > 0 ? (
            <span className={styles.notes}>+{popover.more}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
