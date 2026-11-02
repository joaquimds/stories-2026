import { Link } from '@tanstack/react-router'
import {
  type SimulationNodeDatum,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
} from 'd3-force'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapNode } from '../server/data/map.ts'
import { ROOT_NAME } from '../lib/site.ts'
import { storyParam } from '../domain/thread.ts'
import styles from './StoryMap.module.css'

// The distance each step along a story is pulled out from the centre
const RING = 140
const POPOVER_WIDTH = 280
// Room around the map when framing it
const FRAME_MARGIN = 60
// Until the map is measured in the browser
const DEFAULT_SIZE = { width: 700, height: 500 }

// The map point at the centre of the view, and screen pixels per map unit
type Camera = { x: number; y: number; scale: number }

type Point = { x: number; y: number }

type Body = SimulationNodeDatum & { key: string; depth: number }

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
  let [minX, minY, maxX, maxY] = [0, 0, 0, 0]
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
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

// Dark on the story being read, faded off it; the centre green and tales'
// ends red
const dotClass = (node: MapNode) =>
  [
    styles.dot,
    node.onStory ? styles['dot-story'] : '',
    node.parent === null ? styles['dot-start'] : '',
    node.ending ? styles['dot-end'] : '',
  ].join(' ')

const sentence = (node: MapNode) =>
  node.sentenceId === 0 ? ROOT_NAME : node.content

// Where each sentence starts: on the ring for its depth, in a slice of the
// circle shared among its parent's continuations by how many branch tips
// each leads to. The physics then only has to settle it. Rounded so the
// server and the browser draw the same first frame.
const startingPositions = (nodes: MapNode[]) => {
  const children = new Map<string | null, MapNode[]>()
  for (const node of nodes) {
    children.set(node.parent, [...(children.get(node.parent) ?? []), node])
  }
  const tips = new Map<string, number>()
  const countTips = (node: MapNode): number => {
    const below = children.get(node.key) ?? []
    const count = below.length
      ? below.reduce((sum, child) => sum + countTips(child), 0)
      : 1
    tips.set(node.key, count)
    return count
  }
  const positions = new Map<string, Point>()
  const place = (node: MapNode, from: number, to: number) => {
    const angle = (from + to) / 2
    const radius = node.depth * RING
    positions.set(node.key, {
      x: Math.round(radius * Math.cos(angle) * 100) / 100,
      y: Math.round(radius * Math.sin(angle) * 100) / 100,
    })
    let start = from
    for (const child of children.get(node.key) ?? []) {
      const span =
        ((to - from) * (tips.get(child.key) ?? 1)) / (tips.get(node.key) ?? 1)
      place(child, start, start + span)
      start += span
    }
  }
  for (const centre of children.get(null) ?? []) {
    countTips(centre)
    place(centre, -Math.PI / 2, (3 * Math.PI) / 2)
  }
  return positions
}

// Runs the physics that lays out the map: sentences pulled out to a ring
// for their depth, held to their continuations by springs, pushed apart
// from each other, and kept from overlapping. The first sentence is
// pinned at the centre; the rest start near where they'll settle.
//
// It restarts only when the tree itself changes, not whenever the same
// data arrives again (as it does after a preload), and then keeps the
// sentences it already placed where they are.
const useForceLayout = (nodes: MapNode[]) => {
  const [positions, setPositions] = useState(() => startingPositions(nodes))
  const shape = nodes.map((n) => `${n.key}<${n.parent ?? ''}`).join(' ')
  const latest = useRef(nodes)
  useEffect(() => {
    latest.current = nodes
  })
  // Where everything was, kept for when the tree changes
  const placed = useRef(new Map<string, Point>())
  useEffect(() => {
    const nodes = latest.current
    const kept = placed.current
    const start = startingPositions(nodes)
    const bodies: Body[] = nodes.map((node) => {
      const at = kept.get(node.key) ?? start.get(node.key) ?? { x: 0, y: 0 }
      return {
        key: node.key,
        depth: node.depth,
        x: at.x,
        y: at.y,
        ...(node.parent === null ? { fx: 0, fy: 0 } : {}),
      }
    })
    const links = nodes.flatMap((node) =>
      node.parent ? [{ source: node.parent, target: node.key }] : [],
    )
    const publish = () => {
      const at = new Map(
        bodies.map((b) => [b.key, { x: b.x ?? 0, y: b.y ?? 0 }]),
      )
      placed.current = at
      setPositions(at)
    }
    const simulation = forceSimulation(bodies)
      .force(
        'links',
        forceLink<Body, { source: string; target: string }>(links)
          .id((b) => b.key)
          .distance(RING * 0.8)
          .strength(0.6),
      )
      .force('repel', forceManyBody<Body>().strength(-260))
      .force('rings', forceRadial<Body>((b) => b.depth * RING).strength(0.5))
      .force('collide', forceCollide<Body>(20))
      // Starting close to the end, with more damping, it eases into place
      .alpha(kept.size ? 0.2 : 0.5)
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
  }, [shape])
  return positions
}

// The branches around a story, spreading out from its first sentence;
// panned by dragging and zoomed with the wheel or the buttons
export const StoryMap = ({ nodes }: { nodes: MapNode[] }) => {
  const positions = useForceLayout(nodes)
  const byKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes])

  const [size, setSize] = useState(DEFAULT_SIZE)
  // Follows the layout as it settles, until the reader pans or zooms
  const [chosen, setChosen] = useState<Camera | null>(null)
  const camera = chosen ?? framing(positions.values(), size)
  const [hovered, setHovered] = useState<string | null>(null)
  const pointerType = useRef<string>('mouse')
  const pressing = useRef(false)
  const popoverLink = useRef<HTMLAnchorElement>(null)
  // The popover closes a moment after the pointer leaves, so it can be
  // reached from its dot
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = (key: string) => {
    clearTimeout(hideTimer.current)
    setHovered(key)
  }
  const hideSoon = () => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setHovered(null), 200)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])
  const svg = useRef<SVGSVGElement>(null)
  // The latest camera, for the wheel listener
  const cameraRef = useRef(camera)
  useEffect(() => {
    cameraRef.current = camera
  })
  const drag = useRef<{
    x: number
    y: number
    camera: Camera
    moved: boolean
  }>(null)

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
      setChosen((c) =>
        zoomed(
          c ?? cameraRef.current,
          Math.exp(-event.deltaY * 0.0015),
          pointAt(
            element,
            event.clientX,
            event.clientY,
            c ?? cameraRef.current,
          ),
        ),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', onWheel)
    }
  }, [])

  const zoom = (factor: number) => setChosen(zoomed(camera, factor))
  const width = size.width / camera.scale
  const height = size.height / camera.scale
  const viewBox = [
    camera.x - width / 2,
    camera.y - height / 2,
    width,
    height,
  ].join(' ')

  // The popover sits above its dot, or below near the top, inside the map
  const popover = (() => {
    const node = hovered ? byKey.get(hovered) : undefined
    const at = node ? positions.get(node.key) : undefined
    if (!node || !at) {
      return null
    }
    const x = (at.x - camera.x) * camera.scale + size.width / 2
    const y = (at.y - camera.y) * camera.scale + size.height / 2
    const half = Math.min(POPOVER_WIDTH, size.width - 16) / 2
    const above = y > 140
    return {
      node,
      style: {
        left: Math.min(Math.max(x, half + 8), size.width - half - 8),
        top: above ? y - 16 : y + 16,
        maxWidth: half * 2,
        transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      },
    }
  })()

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
        <button type="button" className="link" onClick={() => setChosen(null)}>
          reset
        </button>
      </div>
      <svg
        ref={svg}
        className={styles.canvas}
        viewBox={viewBox}
        role="img"
        aria-label="Map of the story's branches"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            setHovered(null)
          }
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
        {nodes.map((node) => {
          const from = node.parent ? positions.get(node.parent) : undefined
          const to = positions.get(node.key)
          if (!from || !to) {
            return null
          }
          return (
            <line
              key={`edge-${node.key}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={
                node.onStory && byKey.get(node.parent ?? '')?.onStory
                  ? styles['edge-story']
                  : styles.edge
              }
            />
          )
        })}
        {nodes.map((node) => {
          const at = positions.get(node.key)
          if (!at) {
            return null
          }
          return (
            <g
              key={node.key}
              transform={`translate(${at.x} ${at.y})`}
              onPointerEnter={(event) => {
                // Touch has no hover: a first tap shows the sentence instead
                if (event.pointerType === 'mouse') {
                  show(node.key)
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
                  show(node.key)
                }
              }}
              onBlur={hideSoon}
              onKeyDown={(event) => {
                // Tab moves from a dot to its sentence's link to the story
                if (
                  event.key === 'Tab' &&
                  !event.shiftKey &&
                  hovered === node.key &&
                  popoverLink.current
                ) {
                  event.preventDefault()
                  popoverLink.current.focus()
                }
              }}
            >
              {node.current ? (
                <circle r={10 / camera.scale} className={styles.ring} />
              ) : null}
              <circle r={5 / camera.scale} className={dotClass(node)} />
              <Link
                to="/map/$story"
                params={{ story: storyParam(node.permalink) }}
                aria-label={sentence(node)}
                className={styles.target}
                onClick={(event) => {
                  pressing.current = false
                  // On touch screens, the first tap shows the sentence and
                  // a second opens the map around it
                  if (pointerType.current === 'touch' && hovered !== node.key) {
                    event.preventDefault()
                    show(node.key)
                  }
                }}
              >
                {/* A wider target than the dot, for fingers */}
                <circle r={14 / camera.scale} />
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
          <Link ref={popoverLink} to={popover.node.permalink}>
            {sentence(popover.node)}
          </Link>
          {popover.node.loop || popover.node.more ? (
            <span className={styles.notes}>
              {popover.node.loop ? '↺ ' : ''}
              {popover.node.more ? `+${popover.node.more}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
