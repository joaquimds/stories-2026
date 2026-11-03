import { Link, useNavigate } from '@tanstack/react-router'
import {
  type SimulationNodeDatum,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { MapFragment, MapGraph } from '../server/data/map.ts'
import type { SessionUser } from '../server/auth/sessions.ts'
import { remove, unlink } from '../server/fns/stories.ts'
import { useWriting } from '../lib/use-writing.ts'
import {
  EMPTY,
  type Graph,
  linkKey,
  merge,
  removeFromGraph,
} from '../lib/map-graph.ts'
import { ROOT_NAME } from '../lib/site.ts'
import { ROOT_ID, parseThread, storyParam } from '../domain/thread.ts'
import { walkTargets } from '../domain/walk.ts'
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
// About how tall the write card is, to keep it inside the map
const WRITE_CARD_HEIGHT = 170

// The map point at the centre of the view, and screen pixels per map unit
type Camera = { x: number; y: number; scale: number }

type Point = { x: number; y: number }

type Body = SimulationNodeDatum & { id: number }

// The story the map is showing: its sentences from the root, the
// permalink of the story up to each, and what each was written after
export type MapStory = {
  path: number[]
  prefixes: string[]
  pathDefaults: Record<number, number | null>
}

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
const useForceLayout = (
  graph: Graph,
  anchor: number,
  // Where particular new sentences should start, such as where you chose
  // to write one
  hints: { current: Map<number, Point> },
) => {
  const [positions, setPositions] = useState(() =>
    placeNew(graph, new Map(), anchor),
  )
  const latest = useRef({ graph, anchor, positions })
  useEffect(() => {
    latest.current = { graph, anchor, positions }
  })
  useEffect(() => {
    const { graph, anchor, positions: placed } = latest.current
    const seeded = new Map(placed)
    for (const [id, at] of hints.current) {
      if (!placed.has(id) && graph.fragments.has(id)) {
        seeded.set(id, at)
      }
    }
    const start = placeNew(graph, seeded, anchor)
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
  }, [graph, hints])
  return positions
}

// An arrowhead with its tip at `tip`, pointing along `direction`
const arrowhead = (tip: Point, direction: Point, size: number) => {
  const length = Math.hypot(direction.x, direction.y) || 1
  const u = { x: direction.x / length, y: direction.y / length }
  const base = { x: tip.x - u.x * size, y: tip.y - u.y * size }
  const half = size * 0.55
  return {
    base,
    d: `M ${tip.x} ${tip.y} L ${base.x - u.y * half} ${base.y + u.x * half} L ${
      base.x + u.y * half
    } ${base.y - u.x * half} Z`,
  }
}

// A link as a line with an arrowhead where it arrives, or at both ends for
// two sentences linking each other, kept clear of the dots by `leave` and
// `arrive`
const linkShape = (
  a: Point,
  b: Point,
  leave: number,
  arrive: number,
  head: number,
  twoWay: boolean,
) => {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const from = Math.min(leave, length * 0.45)
  const to = Math.min(arrive, length * 0.45)
  const end = arrowhead({ x: b.x - u.x * to, y: b.y - u.y * to }, u, head)
  const start = twoWay
    ? arrowhead(
        { x: a.x + u.x * from, y: a.y + u.y * from },
        { x: -u.x, y: -u.y },
        head,
      )
    : { base: { x: a.x + u.x * from, y: a.y + u.y * from }, d: '' }
  return {
    line: `M ${start.base.x} ${start.base.y} L ${end.base.x} ${end.base.y}`,
    head: `${start.d} ${end.d}`.trim(),
  }
}

// A sentence linking to itself, drawn as a small loop above it that comes
// back down with an arrowhead
const selfLoop = (a: Point, size: number, head: number) => {
  const c1 = { x: a.x - size, y: a.y - size * 1.6 }
  const c2 = { x: a.x + size, y: a.y - size * 1.6 }
  const end = { x: a.x + size * 0.25, y: a.y - size * 0.45 }
  const arrow = arrowhead(end, { x: end.x - c2.x, y: end.y - c2.y }, head)
  return {
    line: `M ${a.x - size * 0.25} ${a.y - size * 0.45} C ${c1.x} ${c1.y} ${
      c2.x
    } ${c2.y} ${arrow.base.x} ${arrow.base.y}`,
    head: arrow.d,
  }
}

const sentence = (fragment: MapFragment) =>
  fragment.id === ROOT_ID ? ROOT_NAME : fragment.content

// The graph around a story, which grows as you explore: a dot moves the map
// to its sentence and adds what lies beyond it and what leads into it, and
// nothing already placed moves far.
// Panned by dragging and zoomed with the wheel or the buttons.
export const StoryMap = ({
  graph: loaded,
  story,
  here,
  user,
  tab,
  title,
}: {
  graph: MapGraph
  story: MapStory
  // The story you are on, and what you may do there
  here: {
    thread: string
    permalink: string
    may: { delete: boolean; unlink: boolean }
  }
  user: SessionUser | null
  // Shown in the top left when the story has one
  title?: string | null
  // The tab at the foot of the map, back to the story
  tab?: ReactNode
}) => {
  const [graph, setGraph] = useState(() => merge(EMPTY, loaded))
  // New data for the map arrives as you move around it
  const [lastLoaded, setLastLoaded] = useState(loaded)
  if (loaded !== lastLoaded) {
    setLastLoaded(loaded)
    setGraph((g) => merge(g, loaded))
  }

  // The whole story is always loaded, from the beginning
  const { path } = story
  const current = last(path)
  const onStory = new Set(path)
  const storyLinks = new Set(
    path.slice(1).map((id, i) => linkKey(present(path[i]), id)),
  )

  const hints = useRef(new Map<number, Point>())
  const positions = useForceLayout(graph, present(path[0]), hints)
  const shownAfter = useMemo(() => {
    const counts = new Map<number, number>()
    for (const { from } of graph.links.values()) {
      counts.set(from, (counts.get(from) ?? 0) + 1)
    }
    return counts
  }, [graph])

  const { prefixes, pathDefaults } = story
  const targets = useMemo(
    () =>
      walkTargets({
        links: graph.links.values(),
        defaultParent: (id) =>
          graph.fragments.get(id)?.defaultParent ?? pathDefaults[id] ?? null,
        path,
        prefixes,
        steps: loaded.steps,
      }),
    [graph, path, prefixes, pathDefaults, loaded.steps],
  )
  const target = (fragment: MapFragment) =>
    targets.get(fragment.id) ?? fragment.origin

  // Writing, linking, deleting and unlinking where you are, as on the
  // story page and through the same code; each moves along the map
  const navigate = useNavigate()
  const goTo = (thread: string) =>
    navigate({ to: '/map/$story', params: { story: thread } })
  const back = `/map/${storyParam(here.permalink)}`
  const writing = useWriting({
    thread: here.thread,
    user,
    back,
    // The new sentence starts where you chose to write it
    onWritten: (thread) => {
      const leaf = parseThread(thread)?.leaf
      if (drop && leaf !== undefined) {
        hints.current.set(leaf, drop)
      }
      return goTo(thread)
    },
    onLinked: goTo,
  })
  // Writing and linking start from the + beside where you are: it brings
  // out an arrow ('aim'), which links to a dot it lands on, or opens a
  // card to write in ('write') where it lands in empty space
  const [mode, setMode] = useState<'aim' | 'write' | null>(null)
  // Moving along the map ends whatever you were doing
  const [modeAt, setModeAt] = useState(current)
  if (modeAt !== current) {
    setModeAt(current)
    setMode(null)
  }
  // Where the write card was opened, which is where the new dot starts
  const [drop, setDrop] = useState<Point | null>(null)
  const openWrite = (at: Point) => {
    setDrop(at)
    setMode('write')
  }
  const root = present(path[0])
  const continuing = new Set(
    [...graph.links.values()]
      .filter((l) => l.from === current)
      .map((l) => l.to),
  )
  // What can be linked to from where you are, once logged in: not the
  // beginning, not where you are, and not what already follows
  const linkable = (id: number) =>
    Boolean(user) && id !== ROOT_ID && id !== current && !continuing.has(id)
  const linkTo = (id: number) => {
    setMode(null)
    void writing.linkTo(id)
  }
  const onDelete = () =>
    writing.act(
      () => remove({ data: { story: here.thread } }),
      async (result) => {
        setGraph((g) => removeFromGraph(g, { fragments: [current] }, root))
        await goTo(result.parentThread)
      },
    )
  const onUnlink = () =>
    writing.act(
      () => unlink({ data: { story: here.thread } }),
      async (result) => {
        const previous = path.at(-2)
        setGraph((g) =>
          previous === undefined
            ? g
            : removeFromGraph(
                g,
                { links: [{ from: previous, to: current }] },
                root,
              ),
        )
        await goTo(result.parentThread)
      },
    )
  // Escape puts the arrow away, or closes the write card, keeping its draft
  useEffect(() => {
    if (!mode) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMode(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  // Where the pointer is on the map, and whether it is over it; the + turns
  // round where you are to face it
  const [pointer, setPointer] = useState<Point | null>(null)
  const [overMap, setOverMap] = useState(false)
  const [touched, setTouched] = useState(false)
  const [plusFocused, setPlusFocused] = useState(false)
  const [plusAngle, setPlusAngle] = useState<number | null>(null)
  // Screens without hover show the + from the start
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only, after hydration
      setTouched(true)
    }
  }, [])

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
      // The beginning green
      fragment.id === ROOT_ID ? styles['dot-start'] : '',
      // Tales' ends red
      fragment.continuations === 0 ? styles['dot-end'] : '',
    ].join(' ')

  // Where something about a point sits: above it, or below near the top
  // (or wherever `side` says), inside the map
  const anchored = (
    at: Point,
    side?: 'above' | 'below',
    // Kept this far from the map's edges, for something this tall
    height = 0,
  ) => {
    const x = (at.x - camera.x) * camera.scale + size.width / 2
    const y = (at.y - camera.y) * camera.scale + size.height / 2
    const half = Math.min(POPOVER_WIDTH, size.width - 16) / 2
    const above = side ? side === 'above' : y > 160
    return {
      left: Math.min(Math.max(x, half + 8), size.width - half - 8),
      top: above
        ? Math.max(y - 16, height + 8)
        : Math.min(y + 16, size.height - height - 8),
      width: half * 2,
      transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
    }
  }

  const popover = (() => {
    const fragment = hovered === null ? undefined : graph.fragments.get(hovered)
    const at = fragment ? positions.get(fragment.id) : undefined
    if (!fragment || !at) {
      return null
    }
    const { width, ...style } = anchored(at)
    return {
      fragment,
      more: fragment.continuations - (shownAfter.get(fragment.id) ?? 0),
      style: { ...style, maxWidth: width },
    }
  })()

  const currentAt = positions.get(current)
  // The write card sits where you chose to write, or along the foot of a
  // narrow map
  const writeCard =
    mode === 'write' && drop
      ? size.width < 500
        ? { left: 8, right: 8, bottom: 52 }
        : // On the far side from where you are, so the arrow stays in view
          anchored(
            drop,
            drop.y < (currentAt?.y ?? 0) ? 'above' : 'below',
            WRITE_CARD_HEIGHT,
          )
      : null

  // Where the arrow ends: on a dot that can be linked, or at the pointer;
  // while writing, where the new sentence will go
  const aimAt = (() => {
    if (mode === 'write') {
      return drop
    }
    if (mode !== 'aim') {
      return null
    }
    const dot =
      hovered !== null && linkable(hovered) ? positions.get(hovered) : null
    return dot ?? pointer
  })()

  // The + faces the pointer, or, on a touch screen, the emptiest side of
  // where you are: away from what it links with
  const plusFacing = (() => {
    if (plusAngle !== null && !touched) {
      return plusAngle
    }
    if (!currentAt) {
      return 0
    }
    let [x, y] = [0, 0]
    for (const { from, to } of graph.links.values()) {
      const other = from === current ? to : to === current ? from : undefined
      const at = other === undefined ? undefined : positions.get(other)
      if (at && other !== current) {
        const d = Math.hypot(at.x - currentAt.x, at.y - currentAt.y) || 1
        x += (at.x - currentAt.x) / d
        y += (at.y - currentAt.y) / d
      }
    }
    return x || y ? (Math.atan2(-y, -x) * 180) / Math.PI : -45
  })()
  const showPlus =
    Boolean(currentAt) &&
    mode !== 'write' &&
    (overMap || touched || plusFocused || mode === 'aim')
  // Turns the + to face a point, the short way round
  const facePlus = (at: Point) => {
    if (!currentAt) {
      return
    }
    const target =
      (Math.atan2(at.y - currentAt.y, at.x - currentAt.x) * 180) / Math.PI
    setPlusAngle((previous) => {
      if (previous === null) {
        return target
      }
      const turn = ((((target - previous) % 360) + 540) % 360) - 180
      return previous + turn
    })
  }
  // Where the + sits, for writing from it by keyboard
  const plusPoint = (distance: number): Point | null =>
    currentAt
      ? {
          x: currentAt.x + distance * Math.cos((plusFacing * Math.PI) / 180),
          y: currentAt.y + distance * Math.sin((plusFacing * Math.PI) / 180),
        }
      : null

  const px = 1 / camera.scale
  const fragments = [...graph.fragments.values()]

  return (
    <div className={styles.map}>
      {title ? <h1 className={styles.title}>{title}</h1> : null}
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
        <span className="aside">
          (
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
          )
        </span>
      </div>
      <svg
        ref={svg}
        className={styles.canvas}
        viewBox={viewBox}
        role="img"
        aria-label="Map of the story's branches"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') {
            setOverMap(true)
          }
        }}
        onPointerLeave={() => setOverMap(false)}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') {
            setTouched(true)
          }
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
          if (event.pointerType === 'mouse') {
            // Also after something over the map, like the write card, goes
            setOverMap(true)
            const at = pointAt(
              event.currentTarget,
              event.clientX,
              event.clientY,
              camera,
            )
            setPointer(at)
            if (mode !== 'aim') {
              facePlus(at)
            }
          }
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
        onClick={(event) => {
          // The arrow landing in empty space: write a new sentence there
          if (
            mode === 'aim' &&
            event.target === event.currentTarget &&
            !drag.current?.moved
          ) {
            openWrite(
              pointAt(
                event.currentTarget,
                event.clientX,
                event.clientY,
                camera,
              ),
            )
          }
        }}
        onContextMenu={(event) => {
          // A right click puts the arrow away
          if (mode === 'aim') {
            event.preventDefault()
            setMode(null)
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
          const reverse = linkKey(to, from)
          const twoWay = from !== to && graph.links.has(reverse)
          // A pair linking both ways is one line, drawn once
          if (twoWay && from > to) {
            return null
          }
          const story =
            storyLinks.has(key) || (twoWay && storyLinks.has(reverse))
          const head = (story ? 9 : 7) * px
          // Clear of the ring where you are
          const clear = (id: number) => (id === current ? 13 : 8) * px
          const shape =
            from === to
              ? selfLoop(a, 22 * px, head)
              : linkShape(a, b, clear(from), clear(to), head, twoWay)
          return (
            <g key={key} className={story ? styles['edge-story'] : styles.edge}>
              <path d={shape.line} />
              <path d={shape.head} className={styles.head} />
            </g>
          )
        })}
        {aimAt && currentAt ? (
          <g className={styles.aim}>
            {(() => {
              const onDot =
                mode === 'aim' && hovered !== null && linkable(hovered)
              const shape = linkShape(
                currentAt,
                aimAt,
                13 * px,
                (onDot ? 8 : 0) * px,
                8 * px,
                false,
              )
              return (
                <>
                  <path d={shape.line} />
                  <path d={shape.head} className={styles.head} />
                </>
              )
            })()}
          </g>
        ) : null}
        {fragments.map((fragment) => {
          const at = positions.get(fragment.id)
          if (!at) {
            return null
          }
          const id = fragment.id
          return (
            <g
              key={id}
              transform={`translate(${at.x} ${at.y})`}
              className={
                mode === 'aim' && !linkable(id) && id !== current
                  ? styles.faded
                  : undefined
              }
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
                tabIndex={mode === 'aim' && !linkable(id) ? -1 : undefined}
                aria-label={
                  mode === 'aim' && linkable(id)
                    ? `Link to ${sentence(fragment)}`
                    : sentence(fragment)
                }
                className={styles.target}
                onClick={(event) => {
                  pressing.current = false
                  // On touch screens, the first tap shows the sentence and
                  // a second acts on it
                  if (pointerType.current === 'touch' && hovered !== id) {
                    event.preventDefault()
                    show(id)
                  } else if (mode === 'aim') {
                    // Choosing what to link to rather than moving
                    event.preventDefault()
                    if (linkable(id)) {
                      linkTo(id)
                    }
                  }
                }}
              >
                {/* A wider target than the dot, for fingers */}
                <circle r={14 * px} />
              </Link>
            </g>
          )
        })}
        {showPlus && currentAt ? (
          <g transform={`translate(${currentAt.x} ${currentAt.y})`}>
            <g transform={`rotate(${plusFacing})`}>
              <g
                transform={`translate(${24 * px} 0)`}
                className={styles.plus}
                role="button"
                tabIndex={0}
                aria-label="Write or link from here"
                aria-pressed={mode === 'aim'}
                onPointerDown={(event) => event.stopPropagation()}
                onFocus={() => setPlusFocused(true)}
                onBlur={() => setPlusFocused(false)}
                onClick={() => setMode(mode === 'aim' ? null : 'aim')}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') {
                    return
                  }
                  event.preventDefault()
                  // Enter brings out the arrow; Enter again writes, from
                  // just beyond the +
                  if (mode === 'aim') {
                    const at = plusPoint(60 * px)
                    if (at) {
                      openWrite(at)
                    }
                  } else {
                    setMode('aim')
                  }
                }}
              >
                <circle r={9 * px} />
                <path
                  d={`M ${-4 * px} 0 H ${4 * px} M 0 ${-4 * px} V ${4 * px}`}
                />
              </g>
            </g>
          </g>
        ) : null}
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
          {mode === 'aim' && linkable(popover.fragment.id) ? (
            <div className={styles.actions}>
              <button
                type="button"
                className={`link ${styles.go}`}
                disabled={writing.busy}
                onClick={() => linkTo(popover.fragment.id)}
              >
                link here
              </button>
            </div>
          ) : null}
          {popover.fragment.id === current &&
          mode !== 'aim' &&
          (here.may.delete || here.may.unlink) ? (
            <div className={styles.actions}>
              {here.may.delete ? (
                <button
                  type="button"
                  className={`link ${styles.danger}`}
                  disabled={writing.busy}
                  onClick={() => void onDelete()}
                >
                  delete
                </button>
              ) : null}
              {here.may.unlink ? (
                <button
                  type="button"
                  className={`link ${styles.danger}`}
                  disabled={writing.busy}
                  onClick={() => void onUnlink()}
                >
                  unlink
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {writeCard ? (
        <form
          className={styles.writer}
          style={writeCard}
          aria-label="Write a new fragment"
          onSubmit={(event) => {
            event.preventDefault()
            void writing.submit()
          }}
        >
          <button
            type="button"
            className={`link ${styles.close}`}
            aria-label="Close"
            onClick={() => setMode(null)}
          >
            ×
          </button>
          <textarea
            aria-label="Write"
            value={writing.content}
            onChange={(event) => writing.onChange(event.target.value)}
            placeholder="Write"
            maxLength={280}
            // Opened on purpose, to write in
            autoFocus
          />
          {user ? (
            <button
              className="button"
              disabled={writing.busy || !writing.content.trim()}
            >
              Submit
            </button>
          ) : (
            <button className="button">
              {writing.content.trim()
                ? 'Log in to publish'
                : 'Log in to contribute'}
            </button>
          )}
        </form>
      ) : null}
      {writing.error ? (
        <small className={`error ${styles.error}`}>{writing.error}</small>
      ) : null}
      {tab}
    </div>
  )
}
