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
import styles from './StoryMap.module.css'

// The distance each step along a story is pulled out from the centre
const RING = 140
const LABEL_LENGTH = 22
// Every label shows once zoomed in this far; before that, only the
// reader's sentence and the one pointed at
const LABEL_SCALE = 0.9
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

const label = (node: MapNode) => {
  if (node.sentenceId === 0) {
    return 'Beginnings'
  }
  const text =
    node.content.length > LABEL_LENGTH
      ? `${node.content.slice(0, LABEL_LENGTH).trimEnd()}…`
      : node.content
  return node.loop ? `↺ ${text}` : text
}

// Runs the physics that lays out the map: sentences pulled out to a ring
// for their depth, held to their continuations by springs, pushed apart
// from each other, and kept from overlapping. The first sentence is
// pinned at the centre; everything starts there and spreads out.
const useForceLayout = (nodes: MapNode[]) => {
  const [positions, setPositions] = useState(
    () => new Map<string, Point>(nodes.map((n) => [n.key, { x: 0, y: 0 }])),
  )
  useEffect(() => {
    const bodies: Body[] = nodes.map((node) => ({
      key: node.key,
      depth: node.depth,
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 20,
      ...(node.parent === null ? { fx: 0, fy: 0 } : {}),
    }))
    const links = nodes.flatMap((node) =>
      node.parent ? [{ source: node.parent, target: node.key }] : [],
    )
    const publish = () =>
      setPositions(
        new Map(bodies.map((b) => [b.key, { x: b.x ?? 0, y: b.y ?? 0 }])),
      )
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
  }, [nodes])
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
  const showLabels = camera.scale >= LABEL_SCALE
  const width = size.width / camera.scale
  const height = size.height / camera.scale
  const viewBox = [
    camera.x - width / 2,
    camera.y - height / 2,
    width,
    height,
  ].join(' ')

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
          // Labels sit on the side facing the middle of the view, so they
          // stay inside it
          const leftward = at.x > camera.x
          return (
            <g
              key={node.key}
              transform={`translate(${at.x} ${at.y})`}
              onPointerEnter={(event) => {
                // Touch has no hover: a first tap shows the label instead
                if (event.pointerType === 'mouse') {
                  setHovered(node.key)
                }
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') {
                  setHovered((key) => (key === node.key ? null : key))
                }
              }}
              onPointerDown={(event) => {
                pointerType.current = event.pointerType
                pressing.current = true
              }}
              onFocus={() => {
                // Keyboard focus shows the label; a tap's focus waits for
                // the tap itself
                if (!pressing.current) {
                  setHovered(node.key)
                }
              }}
            >
              {node.current ? (
                <circle r={10 / camera.scale} className={styles.ring} />
              ) : null}
              <circle
                r={5 / camera.scale}
                className={node.onStory ? styles['dot-story'] : styles.dot}
              />
              <Link
                to={node.permalink}
                className={styles.label}
                onClick={(event) => {
                  pressing.current = false
                  // On touch screens, the first tap shows the sentence and
                  // a second opens it
                  if (pointerType.current === 'touch' && hovered !== node.key) {
                    event.preventDefault()
                    setHovered(node.key)
                  }
                }}
              >
                <title>{node.content || 'Beginnings'}</title>
                {/* A wider target than the dot, for fingers */}
                <circle r={14 / camera.scale} className={styles.target} />
                {showLabels || node.current || hovered === node.key ? (
                  <text
                    x={(leftward ? -12 : 12) / camera.scale}
                    y={5 / camera.scale}
                    textAnchor={leftward ? 'end' : 'start'}
                    fontSize={15 / Math.min(camera.scale, 1)}
                    className={node.onStory ? styles['text-story'] : undefined}
                  >
                    {label(node)}
                    {node.more ? (
                      <tspan className={styles.more}> +{node.more}</tspan>
                    ) : null}
                  </text>
                ) : null}
              </Link>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
