import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { layoutTree } from '../domain/map-layout.ts'
import type { MapNode } from '../server/data/map.ts'
import styles from './StoryMap.module.css'

const COLUMN = 230
const ROW = 34
const LABEL_LENGTH = 28
// Starts a little zoomed out, to show more of the tree while staying legible
const START_SCALE = 0.85
// Until the map is measured in the browser
const DEFAULT_SIZE = { width: 700, height: 500 }
// The reader's position starts a little left of centre, to show what's ahead
const LEAD = 60

// The map point at the centre of the view, and screen pixels per map unit
type Camera = { x: number; y: number; scale: number }

const clampScale = (scale: number) => Math.min(Math.max(scale, 0.25), 3)

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

// The branches around a story at reading size, panned by dragging and
// zoomed with the wheel or the buttons
export const StoryMap = ({ nodes }: { nodes: MapNode[] }) => {
  const { positions } = useMemo(
    () => layoutTree(nodes, { column: COLUMN, row: ROW }),
    [nodes],
  )
  const byKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes])

  const initial = useMemo((): Camera => {
    const current = nodes.find((n) => n.current) ?? nodes[0]
    const at = (current && positions.get(current.key)) ?? { x: 0, y: 0 }
    // With nothing before it, the first sentence starts near the left edge
    const lead = current?.depth
      ? LEAD
      : (DEFAULT_SIZE.width / 2 - 2 * LEAD) / START_SCALE
    return { x: at.x + lead, y: at.y, scale: START_SCALE }
  }, [nodes, positions])

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
        {nodes.map((node) => {
          const parent = node.parent ? byKey.get(node.parent) : undefined
          const from = parent ? positions.get(parent.key) : undefined
          const to = positions.get(node.key)
          if (!from || !to) {
            return null
          }
          // Flat beneath the parent's label, curving only near the child
          const bend = to.x - 40
          return (
            <path
              key={`edge-${node.key}`}
              d={`M${from.x} ${from.y} H${bend} C${bend + 25} ${from.y} ${to.x - 15} ${to.y} ${to.x} ${to.y}`}
              className={node.onStory ? styles['edge-story'] : styles.edge}
            />
          )
        })}
        {nodes.map((node) => {
          const at = positions.get(node.key)
          if (!at) {
            return null
          }
          return (
            <g key={node.key} transform={`translate(${at.x} ${at.y})`}>
              {node.current ? <circle r={10} className={styles.ring} /> : null}
              <circle
                r={5}
                className={node.onStory ? styles['dot-story'] : styles.dot}
              />
              <Link to={node.permalink} className={styles.label}>
                <title>{node.content || 'Beginnings'}</title>
                <text
                  x={8}
                  y={-8}
                  className={node.onStory ? styles['text-story'] : undefined}
                >
                  {label(node)}
                  {node.more ? (
                    <tspan className={styles.more}> +{node.more}</tspan>
                  ) : null}
                </text>
              </Link>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
