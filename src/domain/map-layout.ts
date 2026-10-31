// Positions for a tree drawn outward from a central point, like a circular
// maze: depth sets the ring, each leaf gets an equal share of the circle,
// and each parent sits midway between the angles of its first and last
// child.

export type TreeNode = { key: string; parent: string | null }

export type Placement = {
  x: number
  y: number
  // Radians, clockwise from pointing right
  angle: number
  depth: number
  radius: number
}

export type Layout = {
  positions: Map<string, Placement>
  // The outermost ring
  radius: number
}

export const radialLayout = (
  nodes: TreeNode[],
  { ring }: { ring: number },
): Layout => {
  const children = new Map<string, string[]>()
  let root: string | undefined
  for (const node of nodes) {
    if (node.parent === null) {
      root = node.key
    } else {
      children.set(node.parent, [
        ...(children.get(node.parent) ?? []),
        node.key,
      ])
    }
  }
  const positions = new Map<string, Placement>()
  if (root === undefined) {
    return { positions, radius: 0 }
  }

  // First pass: depths and leaf order, iteratively so deep trees can't
  // overflow the stack
  const depth = new Map<string, number>()
  const leaves: string[] = []
  const order: string[] = []
  const stack = [root]
  depth.set(root, 0)
  while (stack.length) {
    const key = stack.pop() as string
    order.push(key)
    const kids = children.get(key) ?? []
    if (!kids.length) {
      leaves.push(key)
    }
    for (const kid of [...kids].reverse()) {
      depth.set(kid, (depth.get(key) ?? 0) + 1)
      stack.push(kid)
    }
  }

  // Leaves share the circle; parents take the middle of their children,
  // working back from the deepest nodes
  const angle = new Map<string, number>()
  leaves.forEach((key, i) => angle.set(key, (2 * Math.PI * i) / leaves.length))
  for (const key of [...order].reverse()) {
    const kids = children.get(key)
    if (kids?.length) {
      const first = angle.get(kids[0] as string) as number
      const last = angle.get(kids.at(-1) as string) as number
      angle.set(key, (first + last) / 2)
    }
  }

  let outer = 0
  for (const key of order) {
    const d = depth.get(key) as number
    const a = angle.get(key) as number
    const radius = d * ring
    outer = Math.max(outer, radius)
    positions.set(key, {
      x: radius * Math.cos(a),
      y: radius * Math.sin(a),
      angle: a,
      depth: d,
      radius,
    })
  }
  return { positions, radius: outer }
}
