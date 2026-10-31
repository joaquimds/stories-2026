import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type Placement, radialLayout } from '../domain/map-layout.ts'
import type { MapNode } from '../server/data/map.ts'
import styles from './StoryMap.module.css'

// Distance between rings; labels end before the next ring's lane
const RING = 180
// Paths run along a lane just inside each ring, like a maze
const LANE = 20
const LABEL_LENGTH = 22
// Labels appear once zoomed in far enough to read them
const LABEL_SCALE = 0.6
// Until the map is measured in the browser
const DEFAULT_SIZE = { width: 700, height: 500 }

// The map point at the centre of the view, and screen pixels per map unit
type Camera = { x: number; y: number; scale: number }

const clampScale = (scale: number) => Math.min(Math.max(scale, 0.1), 3)

// Zooms by `factor`, keeping the map point at `focus` where it is
const zoomed = (
  camera: Camera,
  factor: number,
  focus: { x: number; y: number } = camera,
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
) => {
  const box = element.getBoundingClientRect()
  return {
    x: camera.x + (clientX - box.left - box.width / 2) / camera.scale,
    y: camera.y + (clientY - box.top - box.height / 2) / camera.scale,
  }
}

const point = (radius: number, angle: number) =>
  `${radius * Math.cos(angle)} ${radius * Math.sin(angle)}`

// Out from the parent, along the lane inside the child's ring, then out to
// the child
const mazePath = (from: Placement, to: Placement) => {
  const lane = to.radius - LANE
  if (from.radius === 0) {
    return `M0 0 L${point(lane, to.angle)} L${to.x} ${to.y}`
  }
  const turn = to.angle - from.angle
  const arc =
    Math.abs(turn) < 1e-9
      ? ''
      : `A${lane} ${lane} 0 ${Math.abs(turn) > Math.PI ? 1 : 0} ${turn > 0 ? 1 : 0} ${point(lane, to.angle)}`
  return `M${from.x} ${from.y} L${point(lane, from.angle)} ${arc} L${to.x} ${to.y}`
}

// Half the width of a doorway in a hedge, in screen pixels, allowing for
// the hedge's rounded ends
const DOORWAY = 16

// A ring of hedge with gaps at the given angles, each `half` map units
// either side
const hedgePath = (radius: number, gaps: number[], halfWidth: number) => {
  if (!gaps.length) {
    return `M${point(radius, 0)} A${radius} ${radius} 0 1 1 ${point(radius, Math.PI)} A${radius} ${radius} 0 1 1 ${point(radius, 0)}`
  }
  const half = halfWidth / radius
  const sorted = [...new Set(gaps)].sort((a, b) => a - b)
  return sorted
    .map((gap, i) => {
      // From the end of this doorway to the start of the next, round the
      // circle back to the first
      const next = (sorted[i + 1] ?? (sorted[0] as number) + 2 * Math.PI) - half
      const start = gap + half
      if (next <= start) {
        return ''
      }
      const large = next - start > Math.PI ? 1 : 0
      return `M${point(radius, start)} A${radius} ${radius} 0 ${large} 1 ${point(radius, next)}`
    })
    .join(' ')
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

// The branches around a story as a circular maze, spreading out from its
// first sentence; panned by dragging and zoomed with the wheel or buttons
export const StoryMap = ({ nodes }: { nodes: MapNode[] }) => {
  const { positions, radius } = useMemo(
    () => radialLayout(nodes, { ring: RING }),
    [nodes],
  )
  const byKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes])
  const depth = useMemo(
    () => Math.max(0, ...[...positions.values()].map((p) => p.depth)),
    [positions],
  )

  // Hedges between the rings, with a doorway wherever a path passes
  // through, and an unbroken wall outside
  const hedges = useMemo(() => {
    const doorways = new Map<number, number[]>()
    for (const node of nodes) {
      const at = positions.get(node.key)
      const from = node.parent ? positions.get(node.parent) : undefined
      if (at && from) {
        // Paths cross the hedge beyond their parent along the parent's
        // angle, or the child's when leaving the centre
        const angle = from.radius === 0 ? at.angle : from.angle
        doorways.set(from.depth, [...(doorways.get(from.depth) ?? []), angle])
      }
    }
    return Array.from({ length: depth + 1 }, (_, d) => ({
      radius: (d + 0.5) * RING,
      gaps: doorways.get(d) ?? [],
    }))
  }, [nodes, positions, depth])

  // The whole maze, centred on its middle
  const initial = useMemo((): Camera => {
    const fit =
      Math.min(DEFAULT_SIZE.width, DEFAULT_SIZE.height) / (2 * radius + RING)
    return { x: 0, y: 0, scale: clampScale(Math.min(fit, 1)) }
  }, [radius])

  const [camera, setCamera] = useState(initial)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const svg = useRef<SVGSVGElement>(null)
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
      setCamera((c) =>
        zoomed(
          c,
          Math.exp(-event.deltaY * 0.0015),
          pointAt(element, event.clientX, event.clientY, c),
        ),
      )
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', onWheel)
    }
  }, [])

  const zoom = (factor: number) => setCamera((c) => zoomed(c, factor))
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
        <button
          type="button"
          className="link"
          onClick={() => setCamera(initial)}
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
          setCamera({
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
        {hedges.map((hedge, i) => (
          <path
            key={`hedge-${i}`}
            d={hedgePath(hedge.radius, hedge.gaps, DOORWAY / camera.scale)}
            className={styles.hedge}
          />
        ))}
        {nodes.map((node) => {
          const parent = node.parent ? byKey.get(node.parent) : undefined
          const from = parent ? positions.get(parent.key) : undefined
          const to = positions.get(node.key)
          if (!from || !to) {
            return null
          }
          return (
            <path
              key={`edge-${node.key}`}
              d={mazePath(from, to)}
              className={node.onStory ? styles['edge-story'] : styles.edge}
            />
          )
        })}
        {nodes.map((node) => {
          const at = positions.get(node.key)
          if (!at) {
            return null
          }
          // Labels run outward along their path, never upside down
          const degrees = (at.angle * 180) / Math.PI
          const flip = Math.cos(at.angle) < 0
          return (
            <g key={node.key} transform={`translate(${at.x} ${at.y})`}>
              {node.current ? (
                <circle r={10 / camera.scale} className={styles.ring} />
              ) : null}
              <circle
                r={5 / camera.scale}
                className={node.onStory ? styles['dot-story'] : styles.dot}
              />
              <Link to={node.permalink} className={styles.label}>
                <title>{node.content || 'Beginnings'}</title>
                {/* A wider target than the dot, for fingers */}
                <circle r={14 / camera.scale} className={styles.target} />
                {showLabels ? (
                  <text
                    transform={`rotate(${flip ? degrees + 180 : degrees})`}
                    x={flip ? -8 : 8}
                    y={-5}
                    textAnchor={flip ? 'end' : 'start'}
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
